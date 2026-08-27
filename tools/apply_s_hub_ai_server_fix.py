from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1))


def write(path, content):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + '\n')


# Client: S-Hub AI now uses the authenticated Vercel server route rather than
# calling Firebase AI Logic directly from iOS/browser code.
replace_once(
    'src/s-hub-ai.js',
    "import { generateDirectStructured } from './firebase-ai-direct.js'",
    "import { generateSchoolStructured } from './s-hub-ai-transport.js'",
)
path = Path('src/s-hub-ai.js')
text = path.read_text()
count = text.count('generateDirectStructured({')
if count != 3:
    raise SystemExit(f'src/s-hub-ai.js: expected 3 structured calls, found {count}')
path.write_text(text.replace('generateDirectStructured({', 'generateSchoolStructured({'))

write('src/s-hub-ai-transport.js', r"""
import { ensureSignedIn } from './school-sync'

const S_HUB_AI_API_URL = 'https://school-reminder-backend.vercel.app/api/s-hub-ai'
const MAX_TOTAL_ATTACHMENT_BASE64_CHARS = 3_000_000
const MAX_CLIENT_TIMEOUT_MS = 58_000

function transportError(message, code, status = null, attempts = []) {
  const error = new Error(message)
  error.name = 'SchoolAITransportError'
  error.code = code
  error.status = status
  error.customData = { attempts: Array.isArray(attempts) ? attempts : [] }
  return error
}

export async function generateSchoolStructured({
  prompt = '',
  attachments = [],
  responseSchema,
  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
} = {}) {
  const safePrompt = String(prompt || '').trim()
  if (!safePrompt || !responseSchema || typeof responseSchema !== 'object') {
    throw transportError('AI 요청 정보가 올바르지 않아.', 'school-ai/invalid-request', 400)
  }

  const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 4) : []
  const base64Chars = safeAttachments.reduce((sum, item) => sum + String(item?.dataBase64 || '').length, 0)
  if (base64Chars > MAX_TOTAL_ATTACHMENT_BASE64_CHARS) {
    throw transportError(
      '첨부 용량이 커서 한 번에 분석할 수 없어. 사진 수를 줄이거나 PDF 용량을 줄여줘.',
      'school-ai/request-too-large',
      413,
    )
  }

  const user = await ensureSignedIn()
  const idToken = await user.getIdToken()
  const controller = new AbortController()
  const clientTimeout = Math.min(
    MAX_CLIENT_TIMEOUT_MS,
    Math.max(12_000, Number(timeoutMs || 26000) + 10_000),
  )
  const timeoutId = window.setTimeout(() => controller.abort(), clientTimeout)

  try {
    const response = await fetch(S_HUB_AI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: safePrompt.slice(0, 40_000),
        attachments: safeAttachments,
        responseSchema,
        maxOutputTokens,
        timeoutMs,
        temperature,
      }),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }
    if (!response.ok || !payload?.ok || !payload?.result) {
      throw transportError(
        String(payload?.message || 'AI 서버에 연결하지 못했어. 다시 시도해줘.'),
        String(payload?.error || `school-ai/http-${response.status}`),
        response.status,
        payload?.attempts,
      )
    }
    return payload.result
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw transportError('AI 응답 시간이 초과됐어. 다시 시도해줘.', 'school-ai/server-timeout', 504)
    }
    if (error?.name === 'SchoolAITransportError') throw error
    throw transportError('AI 서버에 연결하지 못했어. 네트워크를 확인하고 다시 시도해줘.', 'school-ai/network-error')
  } finally {
    window.clearTimeout(timeoutId)
  }
}
""")

# UI: rotate native textarea hints every 1.8s, fading the placeholder out before
# swapping text so Safari/iOS gets a smooth transition without an overlay hit target.
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """const REMINDER_TYPES = [
  { id: 'task', label: '일반' },
  { id: 'performance', label: '수행평가' },
  { id: 'exam', label: '시험' },
  { id: 'material', label: '준비물' },
]
""",
    """const REMINDER_TYPES = [
  { id: 'task', label: '일반' },
  { id: 'performance', label: '수행평가' },
  { id: 'exam', label: '시험' },
  { id: 'material', label: '준비물' },
]

const QUESTION_HINTS = [
  '이번 주에 뭐 제출해야 돼?',
  '다음 시험 언제야?',
  '내일 시간표 뭐야?',
  '이번 주 시간표 바뀐 거 있어?',
]

const NOTICE_HINTS = [
  '공지에 대해 덧붙일 설명이 있으면 적어줘.',
  '예: 이건 수행평가 공지야.',
  '예: 마감일과 준비물만 찾아줘.',
  '예: 시간표 변경도 같이 확인해줘.',
]
""",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """  const [editingId, setEditingId] = useState('')
  const [conflictsDirty, setConflictsDirty] = useState(false)
  const fileInputRef = useRef(null)
""",
    """  const [editingId, setEditingId] = useState('')
  const [conflictsDirty, setConflictsDirty] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const [hintFading, setHintFading] = useState(false)
  const fileInputRef = useRef(null)
""",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """    setError('')
    setEditingId('')
    setConflictsDirty(false)
  }, [open])

  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items, state.selected])
  const validSelectedItems = useMemo(() => selectedItems.filter((item) => item.valid !== false), [selectedItems])
""",
    """    setError('')
    setEditingId('')
    setConflictsDirty(false)
    setHintIndex(0)
    setHintFading(false)
  }, [open])

  useEffect(() => {
    setHintIndex(0)
    setHintFading(false)
  }, [files.length])

  useEffect(() => {
    if (!open || input) {
      setHintFading(false)
      return undefined
    }

    let swapTimer = 0
    const interval = window.setInterval(() => {
      setHintFading(true)
      window.clearTimeout(swapTimer)
      swapTimer = window.setTimeout(() => {
        const hintCount = files.length ? NOTICE_HINTS.length : QUESTION_HINTS.length
        setHintIndex((current) => (current + 1) % hintCount)
        setHintFading(false)
      }, 220)
    }, 1800)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(swapTimer)
    }
  }, [open, input, files.length])

  const selectedItems = useMemo(() => state.items.filter((item) => state.selected[item.id]), [state.items, state.selected])
  const validSelectedItems = useMemo(() => selectedItems.filter((item) => item.valid !== false), [selectedItems])
  const hintPool = files.length ? NOTICE_HINTS : QUESTION_HINTS
  const rotatingHint = hintPool[hintIndex % hintPool.length]
""",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 500))}
              placeholder={files.length ? '공지에 대해 덧붙일 설명이 있으면 적어줘.' : '이번 주에 뭐 제출해야 돼?'}
              rows={3}
              disabled={working}
            />
""",
    """            <textarea
              className={hintFading ? 'is-hint-fading' : ''}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 500))}
              placeholder={rotatingHint}
              rows={3}
              disabled={working}
            />
""",
)
replace_once(
    'src/s-hub-ai.css',
    """.s-hub-ai-compose textarea::placeholder,
.s-hub-ai-editor input::placeholder {
  color: var(--text-tertiary);
}
""",
    """.s-hub-ai-compose textarea::placeholder {
  color: var(--text-tertiary);
  opacity: 1;
  transition: opacity 220ms var(--motion-soft);
}

.s-hub-ai-compose textarea.is-hint-fading::placeholder {
  opacity: 0;
}

.s-hub-ai-editor input::placeholder {
  color: var(--text-tertiary);
}
""",
)

# Backend privileged OAuth helper. The Admin SDK cert credential requests a
# cloud-platform access token, so the browser no longer has to satisfy AI Logic
# App Check/CORS itself.
replace_once(
    'push-backend-v2/lib/firebase-admin.js',
    """export function adminAuth() {
  return getAuth(adminApp())
}
""",
    """export function adminAuth() {
  return getAuth(adminApp())
}

export async function adminAccessToken() {
  const credential = adminApp().options.credential
  if (!credential?.getAccessToken) throw new Error('Firebase Admin credential cannot issue an access token')
  const result = await credential.getAccessToken()
  const token = String(result?.access_token || '').trim()
  if (!token) throw new Error('Firebase Admin access token is empty')
  return token
}

export function adminProjectId() {
  const projectId = String(adminApp().options.projectId || '').trim()
  if (!projectId) throw new Error('Firebase Admin project ID is missing')
  return projectId
}
""",
)

write('push-backend-v2/lib/s-hub-ai-service.js', r"""
const DEFAULT_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
]
const MAX_ATTACHMENT_BASE64_CHARS = 3_200_000
const MAX_SCHEMA_CHARS = 14_000

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback
}

function aiEndpoint(projectId, modelName) {
  return `https://firebasevertexai.googleapis.com/v1beta/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}:generateContent`
}

function safeAttachments(value) {
  const attachments = Array.isArray(value) ? value.slice(0, 4) : []
  let total = 0
  return attachments.map((attachment) => {
    const mimeType = String(attachment?.mimeType || '').trim().toLowerCase().slice(0, 120)
    const dataBase64 = String(attachment?.dataBase64 || '').trim()
    if (!mimeType || !dataBase64) throw Object.assign(new Error('Invalid AI attachment'), { status: 400, code: 'invalid_attachment' })
    total += dataBase64.length
    if (total > MAX_ATTACHMENT_BASE64_CHARS) {
      throw Object.assign(new Error('AI attachment payload is too large'), { status: 413, code: 'attachment_too_large' })
    }
    return { inlineData: { mimeType, data: dataBase64 } }
  })
}

function safeSchema(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Invalid response schema'), { status: 400, code: 'invalid_schema' })
  }
  const serialized = JSON.stringify(value)
  if (!serialized || serialized.length > MAX_SCHEMA_CHARS) {
    throw Object.assign(new Error('Response schema is too large'), { status: 400, code: 'invalid_schema' })
  }
  return JSON.parse(serialized)
}

function responseText(payload) {
  return String(
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || '')
      .join('') || '',
  ).trim()
}

export async function requestFirebaseModel({
  projectId,
  accessToken,
  modelName,
  prompt,
  attachments,
  responseSchema,
  maxOutputTokens,
  temperature,
  timeoutMs,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(aiEndpoint(projectId, modelName), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-goog-api-client': 's-hub-server/1.0',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...attachments] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature,
          maxOutputTokens,
        },
      }),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }
    if (!response.ok) {
      const error = new Error(String(payload?.error?.message || `Firebase AI HTTP ${response.status}`))
      error.status = response.status
      error.code = String(payload?.error?.status || `http-${response.status}`)
      throw error
    }

    const generated = responseText(payload)
    if (!generated) {
      const error = new Error('Firebase AI returned an empty response')
      error.status = 502
      error.code = 'empty_response'
      throw error
    }
    try {
      return JSON.parse(generated)
    } catch {
      const error = new Error('Firebase AI returned invalid JSON')
      error.status = 502
      error.code = 'invalid_json'
      throw error
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error(`Firebase AI ${modelName} timed out`)
      timeout.status = 504
      timeout.code = 'model_timeout'
      throw timeout
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function generateStructuredWithFirebaseAI({
  projectId,
  accessToken,
  prompt,
  attachments = [],
  responseSchema,
  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
  models = DEFAULT_MODELS,
}) {
  const safeProjectId = String(projectId || '').trim()
  const safeToken = String(accessToken || '').trim()
  const safePrompt = String(prompt || '').trim().slice(0, 40_000)
  if (!safeProjectId || !safeToken || !safePrompt) {
    throw Object.assign(new Error('Missing Firebase AI server credentials or prompt'), { status: 400, code: 'invalid_request' })
  }

  const parts = safeAttachments(attachments)
  const schema = safeSchema(responseSchema)
  const outputTokens = Math.round(clamp(maxOutputTokens, 200, 5000, 1600))
  const overallTimeout = Math.round(clamp(timeoutMs, 5000, 52_000, 26_000))
  const safeTemperature = clamp(temperature, 0, 1, 0.05)
  const deadline = Date.now() + overallTimeout
  const attempts = []
  let lastError = null

  for (const modelName of (Array.isArray(models) ? models : DEFAULT_MODELS).slice(0, 4)) {
    const remaining = deadline - Date.now()
    if (remaining < 2500) break
    const attemptTimeout = Math.max(2000, Math.min(remaining, parts.length ? 28_000 : 18_000))
    const startedAt = Date.now()
    try {
      const value = await requestFirebaseModel({
        projectId: safeProjectId,
        accessToken: safeToken,
        modelName,
        prompt: safePrompt,
        attachments: parts,
        responseSchema: schema,
        maxOutputTokens: outputTokens,
        temperature: safeTemperature,
        timeoutMs: attemptTimeout,
      })
      return { value, modelName, attempts }
    } catch (error) {
      lastError = error
      attempts.push(`${modelName}: ${String(error?.code || error?.status || 'error')} (${Date.now() - startedAt}ms)`)
      const status = Number(error?.status || 0)
      if ([400, 401, 403].includes(status)) break
    }
  }

  const error = new Error(lastError?.message || 'All Firebase AI server models failed')
  error.status = Number(lastError?.status || 502)
  error.code = String(lastError?.code || 'all_models_failed')
  error.attempts = attempts
  throw error
}
""")

write('push-backend-v2/api/s-hub-ai.js', r"""
import { adminAccessToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'
import { generateStructuredWithFirebaseAI } from '../lib/s-hub-ai-service.js'

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
    const prompt = String(body.prompt || '').trim()
    if (!prompt || prompt.length > 40_000) {
      return res.status(400).json({ ok: false, error: 'invalid_prompt', message: 'AI 요청 내용이 올바르지 않아.' })
    }

    const accessToken = await adminAccessToken()
    const result = await generateStructuredWithFirebaseAI({
      projectId: adminProjectId(),
      accessToken,
      prompt,
      attachments: body.attachments,
      responseSchema: body.responseSchema,
      maxOutputTokens: body.maxOutputTokens,
      timeoutMs: body.timeoutMs,
      temperature: body.temperature,
    })
    return res.status(200).json({ ok: true, result })
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

replace_once(
    'push-backend-v2/vercel.json',
    """    \"api/activity-dispatch.js\": {
      \"maxDuration\": 30
    }
""",
    """    \"api/activity-dispatch.js\": {
      \"maxDuration\": 30
    },
    \"api/s-hub-ai.js\": {
      \"maxDuration\": 60
    }
""",
)

replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v142'", "const CACHE_NAME = 'school-shell-v143'")

write('tests/s-hub-ai-server-route.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub structured AI uses the authenticated Vercel route', () => {
  const ai = read('src/s-hub-ai.js')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(ai, /generateSchoolStructured/)
  assert.doesNotMatch(ai, /generateDirectStructured/)
  assert.match(transport, /school-reminder-backend\.vercel\.app\/api\/s-hub-ai/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
})

test('S-Hub input hints rotate with a soft 1.8 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /QUESTION_HINTS/)
  assert.match(sheet, /NOTICE_HINTS/)
  assert.match(sheet, /window\.setInterval\(\(\) => \{/)
  assert.match(sheet, /\}, 1800\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /textarea\.is-hint-fading::placeholder/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after the S-Hub AI route change', () => {
  assert.match(read('public/sw.js'), /school-shell-v143/)
})
""")

write('push-backend-v2/test/s-hub-ai-service.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStructuredWithFirebaseAI, requestFirebaseModel } from '../lib/s-hub-ai-service.js'

const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

test('server Firebase AI request uses OAuth bearer auth and parses structured JSON', async () => {
  const originalFetch = globalThis.fetch
  let request = null
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'ok' }) }] } }],
    })
  }
  try {
    const value = await requestFirebaseModel({
      projectId: 'school-test',
      accessToken: 'oauth-token',
      modelName: 'gemini-test',
      prompt: 'hello',
      attachments: [],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(value, { answer: 'ok' })
    assert.equal(request.init.headers.Authorization, 'Bearer oauth-token')
    assert.match(request.url, /firebasevertexai\.googleapis\.com/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('server structured AI falls back to the next model on a retryable failure', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return response(503, { error: { status: 'UNAVAILABLE', message: 'try later' } })
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'second' }) }] } }],
    })
  }
  try {
    const result = await generateStructuredWithFirebaseAI({
      projectId: 'school-test',
      accessToken: 'oauth-token',
      prompt: 'hello',
      responseSchema: schema,
      timeoutMs: 8000,
      models: ['model-one', 'model-two'],
    })
    assert.equal(result.value.answer, 'second')
    assert.equal(result.modelName, 'model-two')
    assert.equal(result.attempts.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('server structured AI does not fan out an authorization failure across models', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return response(403, { error: { status: 'PERMISSION_DENIED', message: 'denied' } })
  }
  try {
    await assert.rejects(
      generateStructuredWithFirebaseAI({
        projectId: 'school-test',
        accessToken: 'oauth-token',
        prompt: 'hello',
        responseSchema: schema,
        timeoutMs: 8000,
        models: ['model-one', 'model-two'],
      }),
      (error) => error.status === 403 && error.attempts.length === 1,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
""")
