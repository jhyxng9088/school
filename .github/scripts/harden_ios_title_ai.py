from pathlib import Path

p = Path('src/firebase-ai-direct.js')
t = p.read_text()


def replace_once(old, new, label):
    global t
    count = t.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    t = t.replace(old, new, 1)

replace_once(
    "const SUMMARY_TIMEOUT_MS = 40000\n",
    "const SUMMARY_TIMEOUT_MS = 40000\nconst RAW_TITLE_TIMEOUT_MS = 16000\n",
    'timeout constants',
)

schema_marker = "const SUMMARY_SCHEMA = Schema.object({\n"
if schema_marker not in t:
    raise SystemExit('summary schema marker missing')
raw_schemas = r'''const RAW_TITLE_SCHEMA = {
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

const RAW_SUMMARY_SCHEMA = {
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

'''
t = t.replace(schema_marker, raw_schemas + schema_marker, 1)

marker = "let directAI = null\nlet appCheckInitialized = false\n"
if marker not in t:
    raise SystemExit('direct AI state marker missing')
helpers = r'''
function isAppleStandaloneWebApp() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  const userAgent = window.navigator.userAgent || ''
  const appleTouchDevice = /iPhone|iPad|iPod/i.test(userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  return Boolean(standalone && appleTouchDevice)
}

function rawFirebaseEndpoint(modelName) {
  return `https://firebasevertexai.googleapis.com/v1beta/projects/${firebaseConfig.projectId}/models/${modelName}:generateContent`
}

async function runRawFirebaseModel(modelName, { text, reference, attachments, titleOnly }) {
  const prompt = titleOnly
    ? titlePrompt(text, reference, Boolean(attachments?.length))
    : summaryPrompt(text, reference)
  const parts = [
    { text: prompt },
    ...(attachments || []).map(preparedPart).filter(Boolean),
  ]
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), titleOnly ? RAW_TITLE_TIMEOUT_MS : SUMMARY_TIMEOUT_MS)

  try {
    const response = await fetch(rawFirebaseEndpoint(modelName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': firebaseConfig.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: titleOnly ? RAW_TITLE_SCHEMA : RAW_SUMMARY_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: titleOnly ? 220 : 2200,
        },
      }),
      signal: controller.signal,
    })
    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || rawText || `Direct Firebase AI HTTP ${response.status}`)
      error.name = 'ReminderAIError'
      error.code = payload?.error?.status || `school-ai/raw-http-${response.status}`
      error.status = response.status
      throw error
    }
    const responseText = String(payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '').trim()
    if (!responseText) throw new Error(`Direct Firebase AI ${modelName} returned an empty response`)
    return JSON.parse(responseText)
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error(`Direct Firebase AI ${modelName} timed out`)
      timeout.name = 'ReminderAIError'
      timeout.code = 'school-ai/raw-timeout'
      timeout.status = 504
      throw timeout
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}
'''
t = t.replace(marker, marker + helpers, 1)

old_run = r'''async function runModel(modelName, { text, reference, attachments, titleOnly }) {
  const ai = getDirectAI()
  const schema = titleOnly ? TITLE_SCHEMA : SUMMARY_SCHEMA
  const model = getGenerativeModel(ai, {
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
      maxOutputTokens: titleOnly ? 220 : 2200,
    },
  })
  const parts = (attachments || []).map(preparedPart).filter(Boolean)
  const prompt = titleOnly
    ? titlePrompt(text, reference, parts.length > 0)
    : summaryPrompt(text, reference)
  const result = await withTimeout(
    model.generateContent([prompt, ...parts]),
    titleOnly ? TITLE_TIMEOUT_MS : SUMMARY_TIMEOUT_MS,
    modelName,
  )
  const raw = String(result?.response?.text?.() || '').trim()
  if (!raw) throw new Error(`Direct AI ${modelName} returned an empty response`)
  try {
    return JSON.parse(raw)
  } catch {
    const error = new Error(`Direct AI ${modelName} returned invalid JSON`)
    error.name = 'ReminderAIError'
    error.code = 'school-ai/direct-invalid-json'
    throw error
  }
}'''
new_run = r'''async function runSdkModel(modelName, { text, reference, attachments, titleOnly }) {
  const ai = getDirectAI()
  const schema = titleOnly ? TITLE_SCHEMA : SUMMARY_SCHEMA
  const model = getGenerativeModel(ai, {
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
      maxOutputTokens: titleOnly ? 220 : 2200,
    },
  })
  const parts = (attachments || []).map(preparedPart).filter(Boolean)
  const prompt = titleOnly
    ? titlePrompt(text, reference, parts.length > 0)
    : summaryPrompt(text, reference)
  const result = await withTimeout(
    model.generateContent([prompt, ...parts]),
    titleOnly ? TITLE_TIMEOUT_MS : SUMMARY_TIMEOUT_MS,
    modelName,
  )
  const raw = String(result?.response?.text?.() || '').trim()
  if (!raw) throw new Error(`Direct AI ${modelName} returned an empty response`)
  try {
    return JSON.parse(raw)
  } catch {
    const error = new Error(`Direct AI ${modelName} returned invalid JSON`)
    error.name = 'ReminderAIError'
    error.code = 'school-ai/direct-invalid-json'
    throw error
  }
}

async function runModel(modelName, args) {
  // iOS/iPadOS standalone PWAs have previously failed reCAPTCHA/App Check attestation
  // in this app. Try the already-proven Firebase AI REST route first there, then the SDK.
  if (isAppleStandaloneWebApp()) {
    try {
      return await runRawFirebaseModel(modelName, args)
    } catch (rawError) {
      console.warn(`Raw iOS PWA title AI failed for ${modelName}; trying SDK.`, rawError)
    }
  }

  try {
    return await runSdkModel(modelName, args)
  } catch (sdkError) {
    if (isAppleStandaloneWebApp()) throw sdkError
    try {
      return await runRawFirebaseModel(modelName, args)
    } catch {
      throw sdkError
    }
  }
}'''
replace_once(old_run, new_run, 'runModel block')

p.write_text(t.rstrip() + '\n')
print('iOS title AI hardening applied')
