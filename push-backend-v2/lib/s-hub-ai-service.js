
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
