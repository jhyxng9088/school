from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    p.write_text(text.replace(old, new, 1))


def write(path, content):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + '\n')


# 1) One multimodal request returns both an answer and registrable school items.
replace_once(
    'src/s-hub-ai.js',
    """const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
}
""",
    """const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
}

const ATTACHMENT_QUESTION_SCHEMA = {
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
    """답변 규칙:
- 학생 질문의 의도를 최우선으로 따른다. 일정 후보를 추출하거나 저장 화면용 JSON을 만들지 말고 자연어 답변만 한다.
- 첨부와 SCHOOL_DATA에서 확인할 수 있는 사실만 사용하고, 없는 날짜·과제·준비물·시험을 추측하지 마라.
- 질문이 '오늘 할 일', '오늘 해야 할 것' 같은 요청이면 현재 날짜를 기준으로 오늘 제출·수행·준비·시험·해야 할 일로 확인되는 내용을 짧고 읽기 쉽게 정리한다.
- 첨부와 기존 S-Hub 데이터가 서로 다르면 임의로 하나를 고르지 말고 차이가 있다고 알려라.
- 필요한 정보가 없으면 무엇을 확인할 수 없는지 분명하게 말한다.
- 어떤 데이터도 자동 저장하거나 변경하지 않는다.

SCHOOL_DATA:
${compactJSON(context)}`
""",
    """출력 규칙:
- answer에는 학생 질문의 의도에 직접 답하는 자연어 답변을 적는다.
- 질문이 '오늘 할 일', '오늘 해야 할 것' 같은 요청이면 현재 날짜를 기준으로 오늘 제출·수행·준비·시험·해야 할 일로 확인되는 내용을 짧고 읽기 쉽게 정리한다.
- 동시에 items에는 질문의 범위와 무관하게 첨부 전체에서 실제로 S-Hub에 등록할 가치가 있는 학교 정보를 최대 10개 추출한다.
- items.kind는 reminder / timetable_change / academic만 사용한다.
- reminder는 과제·수행평가·시험·제출·준비물처럼 학생이 해야 하는 일이고 type은 task / performance / exam / material 중 하나다.
- timetable_change는 date, period, subject를 사용하고 모르는 값은 빈 문자열 또는 period=0으로 둔다.
- academic은 startDate/endDate를 사용하며 하루 일정은 두 날짜를 같게 둔다.
- 날짜나 시간이 문서에 없으면 절대 지어내지 말고 빈 값으로 두며 confidence=low로 한다.
- 같은 공지 내용을 표현만 바꿔 items에 중복 생성하지 마라.
- 첨부와 SCHOOL_DATA에서 확인할 수 있는 사실만 사용하고, 없는 날짜·과제·준비물·시험을 추측하지 마라.
- 첨부와 기존 S-Hub 데이터가 서로 다르면 answer에서 차이가 있다고 알려라.
- 어떤 데이터도 자동 저장하거나 변경하지 않는다. items는 반드시 사용자가 확인한 뒤에만 저장된다.

SCHOOL_DATA:
${compactJSON(context)}`
""",
)

replace_once(
    'src/s-hub-ai.js',
    """      responseSchema: QUESTION_SCHEMA,
      maxOutputTokens: 1400,
      timeoutMs: 45000,
      temperature: 0.05,
      purpose: 'school',
      signal,
    })
    const answer = String(generated?.value?.answer || '').trim().slice(0, 5000)
    if (!answer) throw new Error('S-Hub AI가 빈 답변을 반환했어.')
    return { answer, modelName: generated?.modelName || '', attempts: generated?.attempts || [] }
""",
    """      responseSchema: ATTACHMENT_QUESTION_SCHEMA,
      maxOutputTokens: 3600,
      timeoutMs: 45000,
      temperature: 0.05,
      purpose: 'school',
      cacheScope: schoolQuestionCacheScope(text),
      signal,
    })
    const answer = String(generated?.value?.answer || '').trim().slice(0, 5000)
    if (!answer) throw new Error('S-Hub AI가 빈 답변을 반환했어.')
    return {
      answer,
      items: normalizeImportItems({ items: generated?.value?.items || [] }, now),
      modelName: generated?.modelName || '',
      attempts: generated?.attempts || [],
      cacheHit: Boolean(generated?.cacheHit),
    }
""",
)

# 2) Hybrid UI: answer first, then the exact same import review UI when items exist.
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """      const result = await askSchoolHubWithAttachments({ question, files, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      if (!await finishWorkingStage(requestId)) return
      setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))
""",
    """      const result = await askSchoolHubWithAttachments({ question, files, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      const items = Array.isArray(result.items) ? result.items : []
      if (items.length) {
        showWorkingMode('conflict')
        const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })
        if (requestSequenceRef.current !== requestId) return
        if (!await finishWorkingStage(requestId)) return
        const choices = applyConflictSelection(items, conflicts)
        setState({
          mode: 'hybrid',
          answer: result.answer,
          items,
          selected: choices.selected,
          conflicts,
          resolutions: choices.resolutions,
          saveResult: null,
        })
        setConflictsDirty(false)
      } else {
        if (!await finishWorkingStage(requestId)) return
        setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))
      }
""",
)

replace_once(
    'src/s-hub-ai-sheet.jsx',
    "!working && state.mode === 'answer' ? (",
    "!working && (state.mode === 'answer' || state.mode === 'hybrid') ? (",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    "!working && state.mode === 'import' ? (",
    "!working && (state.mode === 'import' || state.mode === 'hybrid') ? (",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    "{state.mode === 'import' ? (",
    "{(state.mode === 'import' || state.mode === 'hybrid') ? (",
)

# 3) Client explicitly opts only stable school questions into the shared server cache.
replace_once(
    'src/s-hub-ai-transport.js',
    """  purpose = 'school',
  signal = null,
""",
    """  purpose = 'school',
  cacheScope = '',
  signal = null,
""",
)
replace_once(
    'src/s-hub-ai-transport.js',
    """        temperature,
      }),
""",
    """        temperature,
        cacheScope: cacheScope === 'school-question' ? 'school-question' : '',
      }),
""",
)

# 4) Authenticated Firestore-backed short cache. Store only a hash and result, never prompt/attachment bytes.
replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    """import { adminAccessToken, adminAppCheckToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'
""",
    """import { createHash } from 'node:crypto'
import { adminAccessToken, adminAppCheckToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'
""",
)
replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    """const FIREBASE_APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
""",
    """const FIREBASE_APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'
const AI_CACHE_COLLECTION = 'sHubAiResponseCache'
const AI_CACHE_TTL_MS = 10 * 60 * 1000

function normalizedPromptForCache(prompt = '') {
  return String(prompt || '').replace(
    /현재 기준 시각:\\s*(\\d{4}-\\d{2}-\\d{2})\\s+\\d{2}:\\d{2}/,
    '현재 기준 날짜: $1',
  )
}

function schoolQuestionCacheKey(body, prompt, purpose) {
  if (body?.cacheScope !== 'school-question' || purpose !== 'school') return ''
  const digest = createHash('sha256')
  digest.update('s-hub-school-question-v1\\n')
  digest.update(normalizedPromptForCache(prompt))
  digest.update('\\nSCHEMA\\n')
  digest.update(JSON.stringify(body.responseSchema || {}))
  digest.update('\\nOPTIONS\\n')
  digest.update(JSON.stringify({ maxOutputTokens: body.maxOutputTokens, temperature: body.temperature, purpose }))
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : []
  attachments.forEach((item, index) => {
    digest.update(`\\nATTACHMENT:${index}:${String(item?.mimeType || '')}\\n`)
    digest.update(String(item?.dataBase64 || ''))
  })
  return digest.digest('hex')
}

async function readSchoolQuestionCache(db, key) {
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

async function writeSchoolQuestionCache(db, key, result) {
  if (!key || !result || typeof result !== 'object') return
  await db.collection(AI_CACHE_COLLECTION).doc(key).set({
    result: { ...result, cacheHit: false },
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + AI_CACHE_TTL_MS,
  })
}
""",
)

replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    """    const [accessToken, appCheckToken] = await Promise.all([
      adminAccessToken(),
      adminAppCheckToken(FIREBASE_APP_ID),
    ])
""",
    """    const db = adminDb()
    const cacheKey = schoolQuestionCacheKey(body, prompt, purpose)
    if (cacheKey) {
      const cached = await readSchoolQuestionCache(db, cacheKey)
      if (cached) return res.status(200).json({ ok: true, result: cached })
    }

    const [accessToken, appCheckToken] = await Promise.all([
      adminAccessToken(),
      adminAppCheckToken(FIREBASE_APP_ID),
    ])
""",
)
replace_once(
    'push-backend-v2/api/s-hub-ai.js',
    """    })
    return res.status(200).json({ ok: true, result })
""",
    """    })
    if (cacheKey) {
      try { await writeSchoolQuestionCache(db, cacheKey, result) } catch (cacheError) {
        console.warn('s-hub-ai cache write failed', cacheError?.message || cacheError)
      }
    }
    return res.status(200).json({ ok: true, result: { ...result, cacheHit: false } })
""",
)

# PWA refresh + regression guards.
replace_once('public/sw.js', 'school-shell-v151', 'school-shell-v152')
replace_once('tests/s-hub-ai-auth.test.js', 'school-shell-v151', 'school-shell-v152')
replace_once('tests/s-hub-ai-server-route.test.js', 'school-shell-v151', 'school-shell-v152')

write('tests/s-hub-ai-hybrid-answer-import.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('attachment questions request one structured answer plus import items', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /ATTACHMENT_QUESTION_SCHEMA/)
  assert.match(ai, /required: \['answer', 'items'\]/)
  assert.match(ai, /items: normalizeImportItems/)
  assert.match(ai, /cacheScope: schoolQuestionCacheScope\(text\)/)
  assert.match(ai, /질문의 범위와 무관하게 첨부 전체에서 실제로 S-Hub에 등록할 가치가 있는 학교 정보를 최대 10개 추출/)
})

test('hybrid result renders answer and the existing import review together', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /mode: 'hybrid'/)
  assert.match(sheet, /state\.mode === 'answer' \|\| state\.mode === 'hybrid'/)
  assert.match(sheet, /state\.mode === 'import' \|\| state\.mode === 'hybrid'/)
  assert.match(sheet, /reviewSchoolImportConflicts\(items, conflictContext, now, \{ signal: controller\.signal \}\)/)
  assert.match(sheet, /\(state\.mode === 'import' \|\| state\.mode === 'hybrid'\) \? \(/)
})

test('shared school-question cache is authenticated, short-lived and request-content keyed', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(endpoint, /AI_CACHE_TTL_MS = 10 \* 60 \* 1000/)
  assert.match(endpoint, /createHash\('sha256'\)/)
  assert.match(endpoint, /normalizedPromptForCache/)
  assert.match(endpoint, /verifyIdToken\(token\)/)
  assert.match(endpoint, /readSchoolQuestionCache\(db, cacheKey\)/)
  assert.match(endpoint, /writeSchoolQuestionCache\(db, cacheKey, result\)/)
  assert.doesNotMatch(endpoint, /prompt:\s*prompt.*AI_CACHE_COLLECTION/s)
  assert.match(transport, /cacheScope: cacheScope === 'school-question'/)
})

test('time-sensitive attachment questions opt out of shared caching', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /지금\|현재/)
  assert.match(ai, /다음\\s\*교시/)
  assert.match(ai, /\? '' : 'school-question'/)
})

test('service worker advances for hybrid answer and import UX', () => {
  assert.match(read('public/sw.js'), /school-shell-v152/)
})
""")
