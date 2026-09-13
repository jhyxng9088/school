const OPENROUTER_CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'google/gemma-4-31b-it:free'
const MAX_ATTACHMENT_BASE64_CHARS = 3_200_000
const MAX_SCHEMA_CHARS = 14_000
const MAX_TEXT_ATTACHMENT_CHARS = 180_000
const MAX_ATTEMPTS = 2

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'text/plain',
  'text/csv',
  'text/rtf',
  'text/html',
  'text/xml',
])

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback
}

function aiError(message, status, code) {
  return Object.assign(new Error(message), { status, code })
}

function safeSchema(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw aiError('Invalid response schema', 400, 'invalid_schema')
  }
  const serialized = JSON.stringify(value)
  if (!serialized || serialized.length > MAX_SCHEMA_CHARS) {
    throw aiError('Response schema is too large', 400, 'invalid_schema')
  }
  return JSON.parse(serialized)
}

function decodeTextAttachment(dataBase64) {
  let decoded = ''
  try {
    decoded = Buffer.from(dataBase64, 'base64').toString('utf8').replace(/\u0000/g, '')
  } catch {
    throw aiError('Invalid text attachment', 400, 'invalid_attachment')
  }
  if (!decoded.trim()) throw aiError('Empty text attachment', 400, 'invalid_attachment')
  return decoded.slice(0, MAX_TEXT_ATTACHMENT_CHARS)
}

function safeAttachments(value) {
  const attachments = Array.isArray(value) ? value.slice(0, 4) : []
  let total = 0
  return attachments.map((attachment, index) => {
    const name = String(attachment?.name || `attachment-${index + 1}`).trim().slice(0, 120)
    const mimeType = String(attachment?.mimeType || '').trim().toLowerCase().slice(0, 120)
    const dataBase64 = String(attachment?.dataBase64 || '').trim()
    if (!mimeType || !dataBase64) throw aiError('Invalid AI attachment', 400, 'invalid_attachment')

    total += dataBase64.length
    if (total > MAX_ATTACHMENT_BASE64_CHARS) {
      throw aiError('AI attachment payload is too large', 413, 'attachment_too_large')
    }

    if (mimeType.startsWith('image/')) {
      return {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${dataBase64}` },
      }
    }

    if (mimeType === 'application/pdf') {
      return {
        type: 'file',
        file: {
          filename: name || `attachment-${index + 1}.pdf`,
          file_data: `data:application/pdf;base64,${dataBase64}`,
        },
      }
    }

    if (TEXT_MIME_TYPES.has(mimeType)) {
      const text = decodeTextAttachment(dataBase64)
      return {
        type: 'text',
        text: `\n--- ATTACHMENT_DATA ${name} (${mimeType}) ---\n${text}\n--- END_ATTACHMENT_DATA ---`,
      }
    }

    throw aiError(`Unsupported AI attachment type: ${mimeType}`, 400, 'unsupported_attachment')
  })
}

function shouldRetry(error) {
  const status = Number(error?.status || 0)
  return [408, 425, 500, 502, 503, 504].includes(status)
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((chunk) => (typeof chunk === 'string' ? chunk : chunk?.text || chunk?.content || ''))
    .join('')
    .trim()
}

function usageInfo(payload) {
  const usage = payload?.usage
  if (!usage || typeof usage !== 'object') return null
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0)
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0)
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens)
  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(0, totalTokens) : 0,
  }
}

function responseHeader(response, name) {
  try {
    const value = response?.headers?.get?.(name)
    return value == null || value === '' ? null : String(value).slice(0, 160)
  } catch {
    return null
  }
}

function rateLimitMetadata(response) {
  return {
    requestId: responseHeader(response, 'x-request-id'),
    retryAfter: responseHeader(response, 'retry-after'),
    limit: responseHeader(response, 'x-ratelimit-limit'),
    remaining: responseHeader(response, 'x-ratelimit-remaining'),
    reset: responseHeader(response, 'x-ratelimit-reset'),
    limitRequests: responseHeader(response, 'x-ratelimit-limit-requests'),
    remainingRequests: responseHeader(response, 'x-ratelimit-remaining-requests'),
    limitTokens: responseHeader(response, 'x-ratelimit-limit-tokens'),
    remainingTokens: responseHeader(response, 'x-ratelimit-remaining-tokens'),
  }
}

function attachmentBase64Chars(value) {
  return (Array.isArray(value) ? value.slice(0, 4) : [])
    .reduce((total, attachment) => total + String(attachment?.dataBase64 || '').length, 0)
}

function structuredPrompt(prompt, responseSchema) {
  return `${prompt}\n\n--- RESPONSE CONTRACT ---\nReturn exactly one JSON object and nothing else. Do not use Markdown fences. The JSON must match this schema as closely as possible. If a value is not supported by the provided facts, use the schema-compatible empty/default value rather than inventing information.\nJSON_SCHEMA:\n${JSON.stringify(responseSchema)}\n--- END RESPONSE CONTRACT ---`
}

function hasPdfAttachment(attachments) {
  return attachments.some((attachment) => attachment?.type === 'file')
}

export async function requestOpenRouterModel({
  apiKey,
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
    const body = {
      model: modelName,
      messages: [{ role: 'user', content: [{ type: 'text', text: structuredPrompt(prompt, responseSchema) }, ...attachments] }],
      response_format: { type: 'json_object' },
      temperature,
      max_tokens: maxOutputTokens,
    }
    if (hasPdfAttachment(attachments)) {
      body.plugins = [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }]
    }

    const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 's-hub-server/2.0',
        'X-Title': 'S-Hub',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }

    if (!response.ok) {
      const message = String(payload?.error?.message || payload?.message || `OpenRouter AI HTTP ${response.status}`)
      const code = String(payload?.error?.code || payload?.code || `http-${response.status}`)
      const error = aiError(message, response.status, code)
      error.rateLimit = rateLimitMetadata(response)
      throw error
    }

    const generated = responseText(payload)
    if (!generated) throw aiError('OpenRouter AI returned an empty response', 502, 'empty_response')

    let value = null
    try {
      value = JSON.parse(generated)
    } catch {
      throw aiError('OpenRouter AI returned invalid JSON', 502, 'invalid_json')
    }

    return { value, usage: usageInfo(payload) }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw aiError(`OpenRouter AI ${modelName} timed out`, 504, 'model_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function generateStructuredAI({
  prompt,
  attachments = [],
  responseSchema,
  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
  modelName = DEFAULT_MODEL,
}) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim()
  const safePrompt = String(prompt || '').trim().slice(0, 40_000)
  const safeModelName = String(modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL
  if (!apiKey) throw aiError('OPENROUTER_API_KEY is not configured', 503, 'openrouter_not_configured')
  if (!safePrompt) throw aiError('Missing AI prompt', 400, 'invalid_request')

  const rawAttachments = Array.isArray(attachments) ? attachments.slice(0, 4) : []
  const contentParts = safeAttachments(rawAttachments)
  const schema = safeSchema(responseSchema)
  const outputTokens = Math.round(clamp(maxOutputTokens, 200, 5000, 1600))
  const overallTimeout = Math.round(clamp(timeoutMs, 5000, 52_000, 26_000))
  const safeTemperature = clamp(temperature, 0, 0.7, 0.05)
  const requestMeta = {
    modelName: safeModelName,
    promptChars: safePrompt.length,
    attachmentCount: rawAttachments.length,
    attachmentBase64Chars: attachmentBase64Chars(rawAttachments),
    maxOutputTokens: outputTokens,
  }
  const deadline = Date.now() + overallTimeout
  const attempts = []
  let lastError = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now()
    if (remaining < 2500) break
    const attemptCap = contentParts.length ? 30_000 : 12_000
    const attemptTimeout = Math.max(2000, Math.min(remaining, attemptCap))
    const startedAt = Date.now()

    try {
      const result = await requestOpenRouterModel({
        apiKey,
        modelName: safeModelName,
        prompt: safePrompt,
        attachments: contentParts,
        responseSchema: schema,
        maxOutputTokens: outputTokens,
        temperature: safeTemperature,
        timeoutMs: attemptTimeout,
      })
      return {
        value: result.value,
        modelName: safeModelName,
        attempts,
        usage: result.usage,
      }
    } catch (error) {
      lastError = error
      attempts.push(`${safeModelName}: ${String(error?.code || error?.status || 'error')} (${Date.now() - startedAt}ms)`)
      if (Number(error?.status) === 429) {
        console.error('openrouter rate-limit diagnostic', {
          ...requestMeta,
          status: 429,
          code: String(error?.code || ''),
          rateLimit: error?.rateLimit || null,
        })
      }
      if (!shouldRetry(error)) break
    }
  }

  const error = new Error(lastError?.message || 'OpenRouter AI request failed')
  error.status = Number(lastError?.status || 502)
  error.code = String(lastError?.code || 'ai_request_failed')
  error.attempts = attempts
  error.rateLimit = lastError?.rateLimit || null
  error.requestMeta = requestMeta
  throw error
}
