from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    write(path, text.replace(old, new, 1))


# 1) Client transport: only Firebase Auth is required on iOS. App Check is minted by the server.
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

  let idToken = ''
  try {
    const user = await ensureSignedIn()
    idToken = String(await user.getIdToken()).trim()
  } catch (error) {
    throw transportError(
      '로그인 정보를 확인하지 못했어. 앱을 다시 열어줘.',
      String(error?.code || 'school-ai/auth-unavailable'),
      401,
    )
  }
  if (!idToken) throw transportError('로그인 정보를 확인하지 못했어. 앱을 다시 열어줘.', 'school-ai/auth-missing', 401)

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

# 2) Server-side Firebase AI: Admin OAuth + Admin-minted App Check (verified in preview against Gemini).
write('push-backend-v2/lib/s-hub-ai-service.js', r"""
const FIREBASE_AI_API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'

const TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
]
const ATTACHMENT_MODELS = [
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
  appCheckToken,
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
        'X-Firebase-AppCheck': appCheckToken,
        'Content-Type': 'application/json',
        'x-goog-api-key': FIREBASE_AI_API_KEY,
        'x-goog-api-client': 's-hub-server/1.1',
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
  appCheckToken,
  prompt,
  attachments = [],
  responseSchema,
  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
  models = null,
}) {
  const safeProjectId = String(projectId || '').trim()
  const safeAccessToken = String(accessToken || '').trim()
  const safeAppCheckToken = String(appCheckToken || '').trim()
  const safePrompt = String(prompt || '').trim().slice(0, 40_000)
  if (!safeProjectId || !safeAccessToken || !safeAppCheckToken || !safePrompt) {
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
  const preferredModels = Array.isArray(models) && models.length
    ? models
    : (parts.length ? ATTACHMENT_MODELS : TEXT_MODELS)

  for (const modelName of preferredModels.slice(0, 4)) {
    const remaining = deadline - Date.now()
    if (remaining < 2500) break
    const attemptTimeout = Math.max(2000, Math.min(remaining, parts.length ? 20_000 : 10_000))
    const startedAt = Date.now()
    try {
      const value = await requestFirebaseModel({
        projectId: safeProjectId,
        accessToken: safeAccessToken,
        appCheckToken: safeAppCheckToken,
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
import { adminAccessToken, adminAppCheckToken, adminAuth, adminDb, adminProjectId } from '../lib/firebase-admin.js'
import { generateStructuredWithFirebaseAI } from '../lib/s-hub-ai-service.js'

const FIREBASE_APP_ID = '1:321702677113:web:390c5d63e3d93ec17f22a8'

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

# 3) Reminder AI: keep the same structured contract, but use the verified S-Hub server transport.
firebase_ai = read('src/firebase-ai.js')
firebase_ai = firebase_ai.replace(
    "const REMINDER_API_URL = 'https://school-ai-backend-ruby.vercel.app/api/reminder'\nconst TEXT_REQUEST_TIMEOUT_MS = 18000\nconst ATTACHMENT_REQUEST_TIMEOUT_MS = 45000\n",
    "import { generateSchoolStructured } from './s-hub-ai-transport.js'\n\nconst TEXT_REQUEST_TIMEOUT_MS = 15000\nconst ATTACHMENT_REQUEST_TIMEOUT_MS = 30000\n",
    1,
)
marker = "])\n\nfunction reminderError"
if firebase_ai.count(marker) != 1:
    raise SystemExit('firebase-ai.js: supported type marker mismatch')
contract = r"""])

const REMINDER_TITLE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['task', 'performance', 'exam', 'material'] },
    title: { type: 'string' },
    dueDate: { type: 'string' },
    dueTime: { type: 'string' },
    assumedDate: { type: 'boolean' },
  },
  required: ['type', 'title', 'dueDate', 'dueTime', 'assumedDate'],
}

const REMINDER_SUMMARY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['task', 'performance', 'exam', 'material'] },
    title: { type: 'string' },
    dueDate: { type: 'string' },
    dueTime: { type: 'string' },
    assumedDate: { type: 'boolean' },
    summary: {
      type: 'object',
      properties: {
        overview: { type: 'string' },
        sections: {
          type: 'array',
          maxItems: 14,
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              items: { type: 'array', maxItems: 16, items: { type: 'string' } },
            },
            required: ['heading', 'items'],
          },
        },
      },
      required: ['overview', 'sections'],
    },
  },
  required: ['type', 'title', 'dueDate', 'dueTime', 'assumedDate', 'summary'],
}

function reminderError"""
firebase_ai = firebase_ai.replace(marker, contract, 1)
# Remove obsolete old-backend error builder.
firebase_ai, removed = re.subn(r"\nfunction buildBackendError\(response, payload, rawText\) \{.*?\n\}\n\nfunction loadImage", "\nfunction loadImage", firebase_ai, count=1, flags=re.S)
if removed != 1:
    raise SystemExit('firebase-ai.js: buildBackendError removal mismatch')
start = firebase_ai.find('async function parseReminderWithAISingle')
if start < 0:
    raise SystemExit('firebase-ai.js: parser tail marker missing')
new_tail = r"""function reminderTitlePrompt(text, reference, hasAttachments) {
  return `너는 한국 고등학생용 학교 리마인더 정리 AI다.
현재 시각: ${reference}
사용자 입력: ${text || '(텍스트 없음)'}
${hasAttachments ? '첨부된 사진/파일 전체를 빠르게 읽고 제목에 필요한 핵심만 파악해라. 본문 전체 요약은 지금 하지 마라.' : '사용자 문장을 읽고 리마인더를 정리해라.'}

반드시 다음 기준으로 분류한다.
- 수행평가, 발표, PPT, 보고서, 과제 제출, 평가용 활동 -> performance
- 준비물, 가져오기, 챙기기, 지참, 제출물 실물 준비 -> material
- 시험, 고사, 모의고사, 학력평가 -> exam
- 그 외 일반 할 일 -> task

제목은 날짜/시간 군더더기를 빼고 학교생활에서 바로 알아볼 수 있게 짧고 정확하게 만든다.
첨부에 과목명이나 수행 내용이 있으면 제목에 반영한다.
상대 날짜는 현재 시각을 기준으로 실제 YYYY-MM-DD로 계산한다.
날짜가 전혀 없으면 오늘 날짜를 사용하고 assumedDate=true로 한다.
시간이 없으면 dueTime은 빈 문자열이다.`
}

function reminderSummaryPrompt(text, reference) {
  return `너는 한국 고등학생용 학교 리마인더 정리 AI다.
현재 시각: ${reference}
사용자 입력: ${text || '(텍스트 없음)'}
첨부된 사진/파일을 읽어 하나의 리마인더로 정리한다.

1. type은 task/performance/exam/material 중 하나로 정확히 분류한다.
2. title은 과목과 해야 할 일을 짧고 명확하게 만든다.
3. dueDate/dueTime은 첨부와 사용자 입력에서 마감 정보를 찾아 정리한다. 날짜가 없으면 오늘 날짜와 assumedDate=true를 사용한다.
4. summary.overview에는 학생이 무엇을 해야 하는지 핵심을 짧게 요약한다.
5. summary.sections에는 중요한 요구사항, 준비물, 제출 형식, 평가 기준, 일정 등 실제 행동에 필요한 내용을 빠뜨리지 말고 구조화한다.
6. 파일에 없는 사실은 만들지 않는다.`
}

async function serverReminderResult(input, now, files, { titleOnly = false } = {}) {
  const text = String(input || '').trim().slice(0, 140)
  const selectedFiles = Array.isArray(files) ? files.filter((file) => file instanceof Blob).slice(0, 4) : []
  if (!text && !selectedFiles.length) return null

  const prepared = await Promise.all(selectedFiles.map(prepareAttachment))
  const wantsSummary = selectedFiles.length > 0 && !titleOnly
  const response = await generateSchoolStructured({
    prompt: wantsSummary
      ? reminderSummaryPrompt(text, localReference(now))
      : reminderTitlePrompt(text, localReference(now), selectedFiles.length > 0),
    attachments: prepared,
    responseSchema: wantsSummary ? REMINDER_SUMMARY_RESPONSE_SCHEMA : REMINDER_TITLE_RESPONSE_SCHEMA,
    maxOutputTokens: wantsSummary ? 2200 : 220,
    timeoutMs: wantsSummary ? ATTACHMENT_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS,
    temperature: 0.1,
  })

  const base = normalizeResult(response?.value)
  if (!base) {
    const error = new Error('AI response did not match the reminder schema')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/invalid-response'
    error.status = 502
    throw error
  }
  if (!wantsSummary) return { ...base, modelName: String(response?.modelName || '') }

  const summary = normalizeSummary(response?.value?.summary)
  if (!summary) {
    const error = new Error('AI summary response was empty')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/summary-empty'
    error.status = 502
    throw error
  }
  return {
    ...base,
    summary,
    modelName: String(response?.modelName || ''),
  }
}

function mergeAttachmentResults(results, files) {
  if (!results.length) return null
  if (results.length === 1) return results[0]

  const primary = [...results].sort((a, b) => {
    const aKey = `${a?.dueDate || '9999-99-99'}T${a?.dueTime || '23:59'}`
    const bKey = `${b?.dueDate || '9999-99-99'}T${b?.dueTime || '23:59'}`
    return aKey.localeCompare(bKey)
  })[0] || results[0]

  const overviewParts = []
  const seenOverview = new Set()
  results.forEach((result, index) => {
    const overview = String(result?.summary?.overview || '').trim()
    if (!overview || seenOverview.has(overview)) return
    seenOverview.add(overview)
    const label = String(files[index]?.name || `첨부 ${index + 1}`).slice(0, 80)
    overviewParts.push(`${label}: ${overview}`)
  })

  const sections = []
  results.forEach((result, index) => {
    const label = String(files[index]?.name || `첨부 ${index + 1}`).slice(0, 48)
    const sourceSections = Array.isArray(result?.summary?.sections) ? result.summary.sections : []
    sourceSections.forEach((section) => {
      if (sections.length >= 13) return
      sections.push({
        heading: `${label} · ${String(section?.heading || '내용')}`.slice(0, 80),
        items: Array.isArray(section?.items) ? section.items.slice(0, 16) : [],
      })
    })
  })

  return {
    ...primary,
    summary: {
      overview: overviewParts.join('\n\n').slice(0, 2400),
      sections,
    },
  }
}

export async function parseReminderTitleWithAI(input, now = new Date(), attachmentInput = null) {
  const text = String(input || '').trim().slice(0, 140)
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []
  return serverReminderResult(text, now, files, { titleOnly: true })
}

export async function parseReminderWithAI(input, now = new Date(), attachmentInput = null) {
  const files = Array.isArray(attachmentInput)
    ? attachmentInput.filter((file) => file instanceof Blob).slice(0, 4)
    : attachmentInput instanceof Blob ? [attachmentInput] : []

  if (!files.length) return serverReminderResult(input, now, [], { titleOnly: true })

  const cacheId = await attachmentAnalysisCacheId(input, now, files)
  const cached = cachedAttachmentAnalysis(cacheId)
  if (cached) return cached

  // Analyze each attachment through the same verified server route. Keeping each request
  // bounded avoids Vercel request-body spikes when several photos are selected at once.
  const results = await Promise.all(
    files.map((file) => serverReminderResult(input, now, [file], { titleOnly: false })),
  )
  const result = mergeAttachmentResults(results, files)
  if (!result) return null

  const attachments = files.map((file) => normalizeAttachment({
    name: String(file.name || '첨부파일').slice(0, 120),
    mimeType: inferredAttachmentType(file),
    size: Number(file.size || 0),
  })).filter(Boolean)
  const enriched = {
    ...result,
    attachment: attachments[0] || null,
    attachments,
  }
  cacheAttachmentAnalysis(cacheId, enriched)
  return enriched
}
"""
firebase_ai = firebase_ai[:start] + new_tail
write('src/firebase-ai.js', firebase_ai)

# 4) Original reminder files: cache resolved chunk reads in memory and warm the first original when summary opens.
sync = read('src/school-sync.js')
cache_marker = "const ORIGINAL_ATTACHMENT_CHUNK_CHARS = 600_000\n"
if sync.count(cache_marker) != 1:
    raise SystemExit('school-sync.js: cache constant marker mismatch')
sync = sync.replace(cache_marker, cache_marker + "const ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX = 10\nconst originalAttachmentMemoryCache = new Map()\n", 1)
old_upload_tail = """  await setDoc(originalAttachmentRef(profile, safeId), {
    name: String(file.name || '원본 파일').slice(0, 120),
    mimeType,
    size,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  })
}

export async function getReminderOriginal(profile, todoId) {
  const safeId = safeOriginalTodoId(todoId)
  if (!safeId) throw new Error('원본 파일을 찾을 수 없어.')
  await ensureSignedIn()
  const metadataSnapshot = await getDoc(originalAttachmentRef(profile, safeId))
  if (!metadataSnapshot.exists()) {
    const error = new Error('이 리마인더는 원본 저장 기능 적용 전에 만들어져서 원본이 없어. 사진을 다시 올려줘.')
    error.code = 'school-sync/original-not-found'
    throw error
  }
  const metadata = metadataSnapshot.data() || {}
  const chunkCount = Number(metadata.chunkCount || 0)
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 24) throw new Error('원본 파일 정보가 올바르지 않아.')
  const snapshots = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) => getDoc(originalAttachmentChunkRef(profile, safeId, index))),
  )
  if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error('원본 파일 일부를 불러오지 못했어.')
  return {
    name: String(metadata.name || '원본 사진').slice(0, 120),
    mimeType: String(metadata.mimeType || 'application/octet-stream'),
    size: Number(metadata.size || 0),
    dataBase64: snapshots.map((snapshot) => String(snapshot.data()?.data || '')).join(''),
  }
}
"""
new_upload_tail = """  await setDoc(originalAttachmentRef(profile, safeId), {
    name: String(file.name || '원본 파일').slice(0, 120),
    mimeType,
    size,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  })
  originalAttachmentMemoryCache.delete(`${classKeyFor(profile)}:${safeId}`)
}

export async function getReminderOriginal(profile, todoId) {
  const safeId = safeOriginalTodoId(todoId)
  if (!safeId) throw new Error('원본 파일을 찾을 수 없어.')
  const cacheKey = `${classKeyFor(profile)}:${safeId}`
  const cached = originalAttachmentMemoryCache.get(cacheKey)
  if (cached) return cached

  const request = (async () => {
    await ensureSignedIn()
    const metadataSnapshot = await getDoc(originalAttachmentRef(profile, safeId))
    if (!metadataSnapshot.exists()) {
      const error = new Error('이 리마인더는 원본 저장 기능 적용 전에 만들어져서 원본이 없어. 사진을 다시 올려줘.')
      error.code = 'school-sync/original-not-found'
      throw error
    }
    const metadata = metadataSnapshot.data() || {}
    const chunkCount = Number(metadata.chunkCount || 0)
    if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 24) throw new Error('원본 파일 정보가 올바르지 않아.')
    const snapshots = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => getDoc(originalAttachmentChunkRef(profile, safeId, index))),
    )
    if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error('원본 파일 일부를 불러오지 못했어.')
    return {
      name: String(metadata.name || '원본 사진').slice(0, 120),
      mimeType: String(metadata.mimeType || 'application/octet-stream'),
      size: Number(metadata.size || 0),
      dataBase64: snapshots.map((snapshot) => String(snapshot.data()?.data || '')).join(''),
    }
  })()

  originalAttachmentMemoryCache.set(cacheKey, request)
  while (originalAttachmentMemoryCache.size > ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX) {
    const oldestKey = originalAttachmentMemoryCache.keys().next().value
    if (!oldestKey) break
    originalAttachmentMemoryCache.delete(oldestKey)
  }
  try {
    return await request
  } catch (error) {
    if (originalAttachmentMemoryCache.get(cacheKey) === request) originalAttachmentMemoryCache.delete(cacheKey)
    throw error
  }
}
"""
if sync.count(old_upload_tail) != 1:
    raise SystemExit('school-sync.js: original loader block mismatch')
sync = sync.replace(old_upload_tail, new_upload_tail, 1)
write('src/school-sync.js', sync)

summary = read('src/reminder-summary.jsx')
replace = """  const objectUrlRef = useRef('')
  const [expanded, setExpanded] = useState(false)
"""
with_prepared = """  const objectUrlRef = useRef('')
  const preparedOriginalsRef = useRef(new Map())
  const preloadTimerRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
"""
if summary.count(replace) != 1:
    raise SystemExit('reminder-summary.jsx: ref marker mismatch')
summary = summary.replace(replace, with_prepared, 1)
old_effect_cleanup = """    setViewer(null)
    dragRef.current = null
    pullRef.current = null
    const previousOverflow = document.body.style.overflow
"""
new_effect_cleanup = """    setViewer(null)
    preparedOriginalsRef.current.clear()
    if (preloadTimerRef.current) {
      window.clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
    dragRef.current = null
    pullRef.current = null
    const previousOverflow = document.body.style.overflow
"""
if summary.count(old_effect_cleanup) != 1:
    raise SystemExit('reminder-summary.jsx: reset marker mismatch')
summary = summary.replace(old_effect_cleanup, new_effect_cleanup, 1)
old_return_cleanup = """      stopAnimation()
      document.body.style.overflow = previousOverflow
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
"""
new_return_cleanup = """      stopAnimation()
      if (preloadTimerRef.current) window.clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
      preparedOriginalsRef.current.clear()
      document.body.style.overflow = previousOverflow
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
"""
if summary.count(old_return_cleanup) != 1:
    raise SystemExit('reminder-summary.jsx: cleanup marker mismatch')
summary = summary.replace(old_return_cleanup, new_return_cleanup, 1)
old_open = """  async function openOriginal(entry) {
    if (!loadOriginal || originalState === 'loading') return
    setOriginalState('loading')
    setOriginalError('')
    try {
      const original = await loadOriginal(entry?.key || '')
      const blob = base64ToBlob(original.dataBase64, original.mimeType)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setViewer({ ...original, blob, url })
      setOriginalState('ready')
    } catch (error) {
      console.error('Original reminder image load failed:', error)
      setOriginalError(error?.message || '원본 사진을 불러오지 못했어.')
      setOriginalState('error')
    }
  }
"""
new_open = """  function prepareOriginal(entry) {
    if (!loadOriginal) return Promise.reject(new Error('원본 파일을 불러올 수 없어.'))
    const key = String(entry?.key || '')
    const cached = preparedOriginalsRef.current.get(key)
    if (cached) return cached
    const request = loadOriginal(key)
      .then((original) => ({
        ...original,
        blob: base64ToBlob(original.dataBase64, original.mimeType),
      }))
      .catch((error) => {
        if (preparedOriginalsRef.current.get(key) === request) preparedOriginalsRef.current.delete(key)
        throw error
      })
    preparedOriginalsRef.current.set(key, request)
    return request
  }

  useEffect(() => {
    if (!todo?.id || !canShowOriginal || !originalEntries[0]) return undefined
    preloadTimerRef.current = window.setTimeout(() => {
      preloadTimerRef.current = null
      void prepareOriginal(originalEntries[0]).catch(() => {
        // Silent preload only. A visible error is shown if the user actually opens it.
      })
    }, 120)
    return () => {
      if (preloadTimerRef.current) window.clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
  }, [todo?.id])

  async function openOriginal(entry) {
    if (!loadOriginal || originalState === 'loading') return
    setOriginalState('loading')
    setOriginalError('')
    try {
      const original = await prepareOriginal(entry)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(original.blob)
      objectUrlRef.current = url
      setViewer({ ...original, url })
      setOriginalState('ready')
    } catch (error) {
      console.error('Original reminder image load failed:', error)
      setOriginalError(error?.message || '원본 사진을 불러오지 못했어.')
      setOriginalState('error')
    }
  }
"""
if summary.count(old_open) != 1:
    raise SystemExit('reminder-summary.jsx: openOriginal marker mismatch')
summary = summary.replace(old_open, new_open, 1)
write('src/reminder-summary.jsx', summary)

# 5) Cache/version + regression tests.
replace_once('public/sw.js', 'school-shell-v144', 'school-shell-v145')
for test_path in ['tests/s-hub-ai-auth.test.js', 'tests/s-hub-ai-server-route.test.js']:
    text = read(test_path).replace('school-shell-v144', 'school-shell-v145')
    write(test_path, text)

write('tests/s-hub-ai-server-route.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub client uses Firebase Auth only and server mints App Check', () => {
  const transport = read('src/s-hub-ai-transport.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const admin = read('push-backend-v2/lib/firebase-admin.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')

  assert.match(transport, /await ensureSignedIn\(\)/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
  assert.doesNotMatch(transport, /X-Firebase-AppCheck/)
  assert.doesNotMatch(transport, /getDirectFirebaseSecurityHeaders/)
  assert.match(admin, /getAppCheck\(adminApp\(\)\)\.createToken/)
  assert.match(endpoint, /adminAppCheckToken\(FIREBASE_APP_ID\)/)
  assert.match(endpoint, /adminAccessToken\(\)/)
  assert.doesNotMatch(endpoint, /req\.headers\['x-firebase-appcheck'\]/)
  assert.match(service, /Authorization: `Bearer \$\{accessToken\}`/)
  assert.match(service, /'X-Firebase-AppCheck': appCheckToken/)
})

test('S-Hub input hints rotate with a soft 2.5 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /\}, 2500\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after iOS AI authentication repair', () => {
  assert.match(read('public/sw.js'), /school-shell-v145/)
})
""")

write('tests/s-hub-ai-auth.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub no longer depends on iOS reCAPTCHA App Check attestation', () => {
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(transport, /ensureSignedIn/)
  assert.match(transport, /getIdToken/)
  assert.doesNotMatch(transport, /firebase-ai-direct/)
  assert.doesNotMatch(transport, /AppCheck|App Check|X-Firebase-AppCheck/)
})

test('server uses Firebase Admin to mint App Check for Firebase AI', () => {
  const admin = read('push-backend-v2/lib/firebase-admin.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  assert.match(admin, /firebase-admin\/app-check/)
  assert.match(admin, /createToken\(safeAppId/)
  assert.match(endpoint, /adminAppCheckToken/)
})

test('service worker cache advances for iOS AI repair', () => {
  assert.match(read('public/sw.js'), /school-shell-v145/)
})
""")

write('tests/reminder-ai-server-route.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('reminder AI uses the verified authenticated S-Hub server transport', () => {
  const source = read('src/firebase-ai.js')
  assert.match(source, /generateSchoolStructured/)
  assert.match(source, /REMINDER_TITLE_RESPONSE_SCHEMA/)
  assert.match(source, /REMINDER_SUMMARY_RESPONSE_SCHEMA/)
  assert.doesNotMatch(source, /school-ai-backend-ruby\.vercel\.app/)
  assert.doesNotMatch(source, /firebase-ai-direct\.js/)
  assert.doesNotMatch(source, /45000/)
})

test('multiple reminder attachments are bounded into individual server requests', () => {
  const source = read('src/firebase-ai.js')
  assert.match(source, /files\.map\(\(file\) => serverReminderResult\(input, now, \[file\]/)
  assert.match(source, /mergeAttachmentResults\(results, files\)/)
})
""")

write('tests/reminder-original-prefetch.test.js', r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('original reminder attachments reuse an in-memory fetch promise', () => {
  const sync = read('src/school-sync.js')
  assert.match(sync, /originalAttachmentMemoryCache = new Map\(\)/)
  assert.match(sync, /const cached = originalAttachmentMemoryCache\.get\(cacheKey\)/)
  assert.match(sync, /if \(cached\) return cached/)
  assert.match(sync, /originalAttachmentMemoryCache\.set\(cacheKey, request\)/)
})

test('summary sheet warms and decodes the first original before the user taps it', () => {
  const summary = read('src/reminder-summary.jsx')
  assert.match(summary, /preparedOriginalsRef = useRef\(new Map\(\)\)/)
  assert.match(summary, /void prepareOriginal\(originalEntries\[0\]\)/)
  assert.match(summary, /blob: base64ToBlob\(original\.dataBase64, original\.mimeType\)/)
  assert.match(summary, /const original = await prepareOriginal\(entry\)/)
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

test('server Firebase AI request uses Admin OAuth, App Check and API key', async () => {
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
      accessToken: 'admin-oauth-token',
      appCheckToken: 'server-app-check-token',
      modelName: 'gemini-test',
      prompt: 'hello',
      attachments: [],
      responseSchema: schema,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 2000,
    })
    assert.deepEqual(value, { answer: 'ok' })
    assert.equal(request.init.headers.Authorization, 'Bearer admin-oauth-token')
    assert.equal(request.init.headers['X-Firebase-AppCheck'], 'server-app-check-token')
    assert.ok(request.init.headers['x-goog-api-key'])
    assert.match(request.url, /firebasevertexai\.googleapis\.com/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('text requests prefer Flash Lite while attachments prefer multimodal Flash', async () => {
  const originalFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return response(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'ok' }) }] } }],
    })
  }
  try {
    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'text', responseSchema: schema,
    })
    await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'image', responseSchema: schema,
      attachments: [{ mimeType: 'image/jpeg', dataBase64: 'AA==' }],
    })
    assert.match(urls[0], /gemini-3\.5-flash-lite/)
    assert.match(urls[1], /gemini-3\.7-flash/)
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
    return response(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'second' }) }] } }] })
  }
  try {
    const result = await generateStructuredWithFirebaseAI({
      projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'hello', responseSchema: schema,
      timeoutMs: 8000, models: ['model-one', 'model-two'],
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
        projectId: 'school-test', accessToken: 'oauth', appCheckToken: 'appcheck', prompt: 'hello', responseSchema: schema,
        timeoutMs: 8000, models: ['model-one', 'model-two'],
      }),
      (error) => error.status === 403 && error.attempts.length === 1,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
""")

# Remove both temporary probes before any final verification/merge.
for probe in [
    Path('push-backend-v2/api/ai-gateway-probe.js'),
    Path('push-backend-v2/api/firebase-ai-admin-probe.js'),
]:
    if probe.exists(): probe.unlink()
