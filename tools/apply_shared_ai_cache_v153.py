from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1))


def write(path, content):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + '\n')


# Client: only stable attachment questions opt into the shared cache.
replace_once(
    'src/s-hub-ai.js',
    """const ATTACHMENT_HYBRID_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    items: NOTICE_SCHEMA.properties.items,
  },
  required: ['answer', 'items'],
}
""",
    """const ATTACHMENT_HYBRID_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    items: NOTICE_SCHEMA.properties.items,
  },
  required: ['answer', 'items'],
}

function schoolQuestionCacheScope(question = '') {
  const text = String(question || '')
  return /(?:지금|현재|몇\\s*시|몇\\s*분|다음\\s*교시|곧|방금)/i.test(text) ? '' : 'school-question'
}
""",
)
replace_once(
    'src/s-hub-ai.js',
    """      responseSchema: ATTACHMENT_HYBRID_SCHEMA,
      maxOutputTokens: 3200,
      timeoutMs: 45000,
      temperature: 0.05,
      purpose: 'school',
      signal,
""",
    """      responseSchema: ATTACHMENT_HYBRID_SCHEMA,
      maxOutputTokens: 3200,
      timeoutMs: 45000,
      temperature: 0.05,
      purpose: 'school',
      cacheScope: schoolQuestionCacheScope(text),
      signal,
""",
)

replace_once(
    'src/s-hub-ai-transport.js',
    """  temperature = 0.05,
  purpose = 'school',
  signal = null,
""",
    """  temperature = 0.05,
  purpose = 'school',
  cacheScope = '',
  signal = null,
""",
)
replace_once(
    'src/s-hub-ai-transport.js',
    """        timeoutMs,
        temperature,
      }),
""",
    """        timeoutMs,
        temperature,
        cacheScope: cacheScope === 'school-question' ? 'school-question' : '',
      }),
""",
)

# Server: authenticated short-lived shared cache. It stores only SHA-256 key + AI result.
write('push-backend-v2/api/s-hub-ai.js', r"""
import { createHash } from 'node:crypto'
import { adminAccessToken, adminAppCheckToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'
import { generateStructuredWithFirebaseAI } from '../lib/s-hub-ai-service.js'

const FIREBASE_APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
const AI_CACHE_COLLECTION = 'sHubAiResponseCache'
const AI_CACHE_TTL_MS = 10 * 60 * 1000

export function normalizedPromptForCache(prompt = '') {
  return String(prompt || '')
    .replace(
      /현재 기준 시각:\s*(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/g,
      '현재 기준 날짜: $1',
    )
    .replace(
      /"reference":"(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}"/g,
      '"reference":"$1"',
    )
}

export function schoolQuestionCacheKey(body, prompt, purpose) {
  if (body?.cacheScope !== 'school-question' || purpose !== 'school') return ''
  const digest = createHash('sha256')
  digest.update('s-hub-school-question-v1\n')
  digest.update(normalizedPromptForCache(prompt))
  digest.update('\nSCHEMA\n')
  digest.update(JSON.stringify(body.responseSchema || {}))
  digest.update('\nOPTIONS\n')
  digest.update(JSON.stringify({ maxOutputTokens: body.maxOutputTokens, temperature: body.temperature, purpose }))
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : []
  attachments.forEach((item, index) => {
    digest.update(`\nATTACHMENT:${index}:${String(item?.mimeType || '')}\n`)
    digest.update(String(item?.dataBase64 || ''))
  })
  return digest.digest('hex')
}

export async function readSchoolQuestionCache(db, key) {
  if (!key) return null
  const ref = db.collection(AI_CACHE_COLLECTION).doc(key)
  const snapshot = await ref.get()
  if (!snapshot.exists) return null
  const data = snapshot.data() || {}
  if (Number(data.expiresAtMs || 0) <= Date.now() || !data.result || typeof data.result !== 'object') {
    ref.delete().catch(() => {})
    return null
  }
  return { ...data.result, cacheHit: true }
}

export async function writeSchoolQuestionCache(db, key, result) {
  if (!key || !result || typeof result !== 'object') return
  await db.collection(AI_CACHE_COLLECTION).doc(key).set({
    result: { ...result, cacheHit: false },
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + AI_CACHE_TTL_MS,
  })
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

function clientMessage(error) {
  const status = Number(error?.status || 0)
  if (status === 413) return '첨부 용량이 너무 커. 사진 수나 파일 용량을 줄여줘.'
  if (status === 429) return 'AI 사용량이 잠시 많아. 잠시 후 다시 시도해줘.'
  if (status === 504) return 'AI 응답 시간이 초과됐어. 다시 시도해줘.'
  if (status === 400) return 'AI 요청 내용을 처리하지 못했어. 입력이나 첨부를 확인해줘.'
  return 'AI 서버에 연결하지 못했어. 다시 시도해줘.'
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어.' })

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const identity = await adminDb().collection('users').doc(decoded.uid).get()
    if (!identity.exists) return res.status(403).json({ ok: false, error: 'identity_missing', message: '학생 정보를 확인하지 못했어.' })

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const purpose = body.purpose === 'reminder' ? 'reminder' : 'school'
    const prompt = String(body.prompt || '').trim()
    if (!prompt || prompt.length > 40_000) {
      return res.status(400).json({ ok: false, error: 'invalid_prompt', message: 'AI 요청 내용이 올바르지 않아.' })
    }

    const db = adminDb()
    const cacheKey = schoolQuestionCacheKey(body, prompt, purpose)
    if (cacheKey) {
      const cached = await readSchoolQuestionCache(db, cacheKey)
      if (cached) return res.status(200).json({ ok: true, result: cached })
    }

    const [accessToken, appCheckToken] = await Promise.all([
      adminAccessToken(),
      adminAppCheckToken(FIREBASE_APP_ID),
    ])
    const result = await generateStructuredWithFirebaseAI({
      projectId: adminProjectId(),
      accessToken,
      appCheckToken,
      prompt,
      attachments: body.attachments,
      responseSchema: body.responseSchema,
      maxOutputTokens: body.maxOutputTokens,
      timeoutMs: body.timeoutMs,
      temperature: body.temperature,
      purpose,
    })
    if (cacheKey) {
      try {
        await writeSchoolQuestionCache(db, cacheKey, result)
      } catch (cacheError) {
        console.warn('s-hub-ai cache write failed', cacheError?.message || cacheError)
      }
    }
    return res.status(200).json({ ok: true, result: { ...result, cacheHit: false } })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어. 앱을 다시 열어줘.' })
    console.error('s-hub-ai failed', {
      code: error?.code,
      status: error?.status,
      attempts: error?.attempts,
      message: error?.message,
    })
    const status = [400, 413, 429, 504].includes(Number(error?.status)) ? Number(error.status) : 502
    return res.status(status).json({
      ok: false,
      error: String(error?.code || 's_hub_ai_failed'),
      message: clientMessage(error),
      attempts: Array.isArray(error?.attempts) ? error.attempts : [],
    })
  }
}
""")

# Force installed PWAs to pick up the already-deployed hybrid UI plus this cache transport.
replace_once('public/sw.js', 'school-shell-v152', 'school-shell-v153')
for path in Path('tests').glob('*.test.js'):
    text = path.read_text()
    if 'school-shell-v152' in text:
        path.write_text(text.replace('school-shell-v152', 'school-shell-v153'))

write('tests/s-hub-ai-shared-cache.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('hybrid attachment questions opt into cache without changing answer-plus-import UX', () => {
  const ai = read('src/s-hub-ai.js')
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(ai, /answerAndAnalyzeSchoolAttachments/)
  assert.match(ai, /cacheScope: schoolQuestionCacheScope\(text\)/)
  assert.match(sheet, /mode: 'import',\n\s+answer: result\.answer/)
  assert.match(sheet, /추가할 수 있는 항목/)
  assert.match(transport, /cacheScope: cacheScope === 'school-question'/)
})

test('minute-sensitive attachment questions do not use shared cache', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /지금\|현재/)
  assert.match(ai, /다음\\s\*교시/)
  assert.match(ai, /\? '' : 'school-question'/)
})

test('shared cache lookup happens only after Firebase auth and student identity verification', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const verifyIndex = endpoint.indexOf('verifyIdToken(token)')
  const identityIndex = endpoint.indexOf("collection('users').doc(decoded.uid).get()")
  const cacheIndex = endpoint.indexOf('readSchoolQuestionCache(db, cacheKey)')
  assert.ok(verifyIndex >= 0 && identityIndex > verifyIndex && cacheIndex > identityIndex)
  assert.match(endpoint, /AI_CACHE_TTL_MS = 10 \* 60 \* 1000/)
  assert.match(endpoint, /createHash\('sha256'\)/)
})

test('cache stores no prompt or attachment bytes and service worker advances', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  assert.match(endpoint, /result: \{ \.\.\.result, cacheHit: false \}/)
  assert.doesNotMatch(endpoint, /prompt:\s*prompt[\s\S]*?createdAtMs/)
  assert.doesNotMatch(endpoint, /dataBase64:[\s\S]*?createdAtMs/)
  assert.match(read('public/sw.js'), /school-shell-v153/)
})
""")

write('push-backend-v2/test/s-hub-ai-cache.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizedPromptForCache,
  schoolQuestionCacheKey,
  readSchoolQuestionCache,
  writeSchoolQuestionCache,
} from '../api/s-hub-ai.js'

function body(overrides = {}) {
  return {
    cacheScope: 'school-question',
    responseSchema: { type: 'object', properties: { answer: { type: 'string' } } },
    maxOutputTokens: 3200,
    temperature: 0.05,
    attachments: [{ mimeType: 'image/png', dataBase64: 'AAA' }],
    ...overrides,
  }
}

test('cache key ignores minute drift but keeps the date and actual school data', () => {
  const promptA = '현재 기준 시각: 2026-08-28 08:12\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:12","reminders":[{"title":"수학"}]}'
  const promptB = '현재 기준 시각: 2026-08-28 08:19\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:19","reminders":[{"title":"수학"}]}'
  assert.equal(schoolQuestionCacheKey(body(), promptA, 'school'), schoolQuestionCacheKey(body(), promptB, 'school'))
  assert.match(normalizedPromptForCache(promptA), /현재 기준 날짜: 2026-08-28/)
  assert.match(normalizedPromptForCache(promptA), /"reference":"2026-08-28"/)
})

test('different attachment or S-Hub context never shares a cache entry', () => {
  const prompt = '현재 기준 시각: 2026-08-28 08:12\n학생 질문: 오늘 할 것 알려줘\nSCHOOL_DATA:{"reference":"2026-08-28 08:12","reminders":[]}'
  const key = schoolQuestionCacheKey(body(), prompt, 'school')
  assert.notEqual(key, schoolQuestionCacheKey(body({ attachments: [{ mimeType: 'image/png', dataBase64: 'BBB' }] }), prompt, 'school'))
  assert.notEqual(key, schoolQuestionCacheKey(body(), prompt.replace('"reminders":[]', '"reminders":[{"title":"영어"}]'), 'school'))
  assert.equal(schoolQuestionCacheKey(body({ cacheScope: '' }), prompt, 'school'), '')
  assert.equal(schoolQuestionCacheKey(body(), prompt, 'reminder'), '')
})

function fakeDb(initial = null) {
  const state = { value: initial, deleted: false, written: null }
  return {
    state,
    collection() {
      return {
        doc() {
          return {
            async get() {
              return state.value ? { exists: true, data: () => state.value } : { exists: false, data: () => null }
            },
            async set(value) { state.written = value },
            async delete() { state.deleted = true },
          }
        },
      }
    },
  }
}

test('cache returns live results and rejects expired results', async () => {
  const live = fakeDb({ result: { value: { answer: 'cached', items: [] } }, expiresAtMs: Date.now() + 60_000 })
  assert.deepEqual(await readSchoolQuestionCache(live, 'abc'), { value: { answer: 'cached', items: [] }, cacheHit: true })

  const expired = fakeDb({ result: { value: { answer: 'old' } }, expiresAtMs: Date.now() - 1 })
  assert.equal(await readSchoolQuestionCache(expired, 'abc'), null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(expired.state.deleted, true)
})

test('cache writes only the AI result and timestamps, not request source data', async () => {
  const db = fakeDb()
  await writeSchoolQuestionCache(db, 'abc', { value: { answer: 'ok', items: [] }, modelName: 'model' })
  assert.deepEqual(db.state.written.result.value, { answer: 'ok', items: [] })
  assert.equal(db.state.written.result.cacheHit, false)
  assert.equal(typeof db.state.written.createdAtMs, 'number')
  assert.equal(typeof db.state.written.expiresAtMs, 'number')
  const stored = JSON.stringify(db.state.written)
  assert.equal(stored.includes('dataBase64'), false)
  assert.equal(stored.includes('학생 질문'), false)
})
""")
