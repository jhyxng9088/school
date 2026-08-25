import { initializeApp } from 'firebase/app'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0',
  authDomain: 'school-adeda.firebaseapp.com',
  projectId: 'school-adeda',
  storageBucket: 'school-adeda.firebasestorage.app',
  messagingSenderId: '321702677113',
  appId: '1:321702677113:web:390c5d63e3d93ec17f22a8',
  measurementId: 'G-PFCP63TWQS',
}

const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LfuppctAAAAAMbZELYt0w0spaR2qTUmgLFdELGu'
const MODEL_NAME = 'gemini-3.5-flash-lite'
const AI_LOGIC_TIMEOUT_MS = 30000
const APPCHECK_DEBUG_TIMEOUT_MS = 8000
const APPCHECK_DEBUG_STORAGE_KEY = 'school.appcheck.debugToken.session'
const AI_ENDPOINT = `https://firebasevertexai.googleapis.com/v1beta/projects/${firebaseConfig.projectId}/models/${MODEL_NAME}:generateContent`

const SYSTEM_INSTRUCTION = `You parse short Korean school reminders for a high-school student.
Return only the structured response required by the JSON schema.

Rules:
- Correct obvious Korean typos, spacing mistakes, and common abbreviations when the intended meaning is clear. Do not invent content.
- Preserve the user's intended subject and task in the title, while removing date/time filler words from the title.
- type must be one of task, performance, exam, material.
- 수행, 수행평가, 발표, 프레젠테이션, PPT/피피티 and clear school assessment work -> performance.
- 시험, 고사, 모의고사, 전국연합, 학력평가, 수능 -> exam.
- 준비물, 챙기기, 가져가기, 지참 and clear things-to-bring -> material.
- Otherwise -> task.
- Resolve relative Korean dates such as 오늘, 내일, 모레, 글피, 이번주/다음주 + weekday using the reference datetime supplied in the user prompt.
- If no date was expressed, use the reference date and set assumedDate to true.
- If no time was expressed, dueTime must be an empty string.
- dueDate must always be a valid YYYY-MM-DD date and dueTime must be HH:MM or empty.
- Be conservative: if a typo could change the meaning, leave that part as written rather than guessing.`

const REMINDER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['task', 'performance', 'exam', 'material'],
    },
    title: { type: 'string' },
    dueDate: { type: 'string' },
    dueTime: { type: 'string' },
    assumedDate: { type: 'boolean' },
  },
  required: ['type', 'title', 'dueDate', 'dueTime', 'assumedDate'],
}

const TYPE_SET = new Set(['task', 'performance', 'exam', 'material'])

const firebaseApp = initializeApp(firebaseConfig)

const appCheck = initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
})

function timeoutError(milliseconds, label = 'AI Logic') {
  const error = new Error(`${label} timed out after ${milliseconds}ms`)
  error.code = label === 'App Check' ? 'school-appcheck/timeout' : 'school-ai/timeout'
  return error
}

function withTimeout(promise, milliseconds, label = 'AI Logic') {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(timeoutError(milliseconds, label)), milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId))
}

function buildAIError(response, payload, rawText) {
  const message = payload?.error?.message || rawText || `AI request failed with HTTP ${response.status}`
  const error = new Error(message)
  error.name = 'FirebaseAIError'
  error.code = payload?.error?.status || `school-ai/http-${response.status}`
  error.status = response.status
  error.customData = payload?.error || null
  return error
}

async function fetchGenerateContent({
  prompt,
  appCheckToken,
  structured = false,
}) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), AI_LOGIC_TIMEOUT_MS)

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
  }

  if (structured) {
    body.systemInstruction = {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    }
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: REMINDER_RESPONSE_SCHEMA,
      maxOutputTokens: 220,
      temperature: 0.1,
    }
  }

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': firebaseConfig.apiKey,
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let payload = null

    try {
      payload = rawText ? JSON.parse(rawText) : null
    } catch {
      payload = null
    }

    if (!response.ok) throw buildAIError(response, payload, rawText)

    return {
      payload,
      rawText,
      responseText: String(
        payload?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || '')
          .join('') || '',
      ).trim(),
      httpStatus: response.status,
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw timeoutError(AI_LOGIC_TIMEOUT_MS, 'AI Logic')
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function directDebugTokenExchange(debugToken) {
  const appResource = `projects/${firebaseConfig.messagingSenderId}/apps/${firebaseConfig.appId}`
  const endpoint = `https://firebaseappcheck.googleapis.com/v1/${appResource}:exchangeDebugToken?key=${encodeURIComponent(firebaseConfig.apiKey)}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debugToken, limitedUse: false }),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  const token = response.ok ? String(payload?.token || '') : ''

  return {
    ok: response.ok && Boolean(token),
    httpStatus: response.status,
    serverStatus: payload?.error?.status || null,
    serverMessage: payload?.error?.message || null,
    returnedTokenLength: token.length,
    token,
  }
}

async function getUsableAppCheckToken(forceRefresh = false) {
  let sdkError = null

  try {
    const result = await withTimeout(
      getToken(appCheck, forceRefresh),
      APPCHECK_DEBUG_TIMEOUT_MS,
      'App Check',
    )
    const token = String(result?.token || '')
    if (token) {
      return {
        token,
        source: 'sdk',
        sdkError: null,
      }
    }

    sdkError = new Error('Firebase App Check token was empty')
    sdkError.code = 'school-appcheck/empty-token'
  } catch (error) {
    sdkError = error
  }

  const debugToken = typeof window !== 'undefined' && self.__SCHOOL_APPCHECK_DEBUG__
    ? String(window.sessionStorage.getItem(APPCHECK_DEBUG_STORAGE_KEY) || '').trim()
    : ''

  if (!debugToken) throw sdkError

  const direct = await withTimeout(
    directDebugTokenExchange(debugToken),
    APPCHECK_DEBUG_TIMEOUT_MS,
    'App Check',
  )

  if (direct.ok && direct.token) {
    return {
      token: direct.token,
      source: 'direct-debug',
      sdkError,
    }
  }

  const error = new Error(
    `Direct App Check debug exchange failed: ${direct.httpStatus || '?'} ${direct.serverStatus || ''} ${direct.serverMessage || ''}`.trim(),
  )
  error.code = 'school-appcheck/direct-debug-exchange-failed'
  error.status = direct.httpStatus || null
  error.customData = {
    sdkErrorCode: sdkError?.code || null,
    sdkErrorMessage: sdkError?.message || null,
  }
  throw error
}

if (typeof window !== 'undefined' && self.__SCHOOL_APPCHECK_DEBUG__) {
  window.__SCHOOL_APPCHECK_DIAGNOSE__ = async () => {
    const startedAt = Date.now()
    try {
      const result = await getUsableAppCheckToken(true)
      return {
        ok: true,
        tokenLength: result.token.length,
        elapsedMs: Date.now() - startedAt,
        source: result.source,
        sdkFallbackCode: result.sdkError?.code || null,
      }
    } catch (error) {
      return {
        ok: false,
        name: error?.name || null,
        code: error?.code || null,
        message: error?.message || String(error),
        status: error?.status || null,
        elapsedMs: Date.now() - startedAt,
      }
    }
  }

  window.__SCHOOL_AI_DIAGNOSE__ = async () => {
    const startedAt = Date.now()

    try {
      const appCheckResult = await getUsableAppCheckToken(false)
      const direct = await fetchGenerateContent({
        prompt: 'Reply with OK',
        appCheckToken: appCheckResult.token,
      })

      return {
        ok: true,
        elapsedMs: Date.now() - startedAt,
        appCheckTokenLength: appCheckResult.token.length,
        appCheckSource: appCheckResult.source,
        responseText: direct.responseText || 'OK',
      }
    } catch (error) {
      return {
        ok: false,
        name: error?.name || null,
        code: error?.code || null,
        message: error?.message || String(error),
        status: error?.status || null,
        elapsedMs: Date.now() - startedAt,
      }
    }
  }
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function normalizeResult(value) {
  if (!value || !TYPE_SET.has(value.type)) return null
  const title = String(value.title || '').trim().slice(0, 80)
  const dueDate = String(value.dueDate || '').trim()
  const dueTime = String(value.dueTime || '').trim()
  if (!title || !validDateKey(dueDate)) return null
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return null

  return {
    type: value.type,
    title,
    dueDate,
    dueTime,
    assumedDate: Boolean(value.assumedDate),
    source: 'ai',
  }
}

function localReference(now) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export async function parseReminderWithAI(input, now = new Date()) {
  const text = String(input || '').trim()
  if (!text) return null

  const appCheckResult = await getUsableAppCheckToken(false)
  const appCheckToken = appCheckResult.token

  const prompt = `Reference local datetime: ${localReference(now)} (Asia/Seoul)\nReminder: ${text}`
  const result = await fetchGenerateContent({
    prompt,
    appCheckToken,
    structured: true,
  })

  const parsed = JSON.parse(result.responseText)
  const normalized = normalizeResult(parsed)
  if (!normalized) throw new Error('AI response did not match the reminder schema')
  return normalized
}
