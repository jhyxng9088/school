const MISTRAL_CHAT_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions'
const MISTRAL_PRIMARY_MODEL = 'mistral-small-2603'
const MISTRAL_FALLBACK_MODEL = 'ministral-14b-2512'
const MISTRAL_MODEL_CHAIN = Object.freeze([MISTRAL_PRIMARY_MODEL, MISTRAL_FALLBACK_MODEL])
const MISTRAL_TEXT_TIMEOUT_MS = 18_000
const MISTRAL_ATTACHMENT_TIMEOUT_MS = 26_000
const OPENROUTER_CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODEL_CHAIN = Object.freeze([
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it-20260403:free',
  'openrouter/free',
])
const TEXT_RECOVERY_MODEL_CHAIN = Object.freeze([
  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-20b:free',
  'inclusionai/ling-3.0-tiny:free',
])
const IMAGE_MODEL_CHAIN = Object.freeze([
  'inclusionai/ling-3.0-flash-vl:free',
  'dots-studio/dots-3-note-preview:free',
  'openrouter/free',
])
const DEFAULT_MODEL = OPENROUTER_MODEL_CHAIN[0]
const IMAGE_MODEL_TIMEOUT_MS = 14_000
const TEXT_RECOVERY_MODEL_TIMEOUT_MS = 9_000
const MIN_IMAGE_REQUEST_TIMEOUT_MS = 46_000
const MIN_TEXT_REQUEST_TIMEOUT_MS = 33_000
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

function safeMistralAttachments(value) {
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
        image_url: `data:${mimeType};base64,${dataBase64}`,
      }
    }

    if (mimeType === 'application/pdf') {
      return {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${dataBase64}`,
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

function shouldTryNextImageModel(error) {
  const status = Number(error?.status || 0)
  return status === 404 || status === 429 || shouldRetry(error)
}

function shouldFallbackFromMistral(error) {
  const status = Number(error?.status || 0)
  const code = String(error?.code || '')
  return [400, 401, 403, 404, 408, 425, 429, 500, 502, 503, 504].includes(status)
    || code === 'empty_response'
    || code === 'invalid_json'
    || code === 'model_timeout'
}

function shouldTryTextRecovery(error) {
  const status = Number(error?.status || 0)
  const code = String(error?.code || '')
  return status === 404 || shouldRetry(error) || code === 'empty_response' || code === 'invalid_json'
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

function parseGeneratedJson(generated) {
  const text = String(generated || '').trim()
  const candidates = [text]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1).trim())
  }

  for (const candidate of [...new Set(candidates)]) {
    if (!candidate) continue
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {}
  }
  throw aiError('OpenRouter AI returned invalid JSON', 502, 'invalid_json')
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

function hasImageAttachment(attachments) {
  return attachments.some((attachment) => attachment?.type === 'image_url')
}

function safeRoutingModels(modelName, modelNames) {
  const requested = (Array.isArray(modelNames) ? modelNames : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 6)
  if (requested.length) return [...new Set(requested)]
  const single = String(modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL
  return [single]
}

function supportsResponseFormat(modelName) {
  const value = String(modelName || '').trim()
  return ![
    'inclusionai/ling-3.0-flash-vl:free',
    'inclusionai/ling-3.0-tiny:free',
    'openrouter/free',
  ].includes(value)
}

function logRateLimitDiagnostic(label, requestMeta, error, modelName) {
  console.error(label, {
    ...requestMeta,
    modelName: String(modelName || requestMeta.modelName || ''),
    status: 429,
    code: String(error?.code || ''),
    rateLimit: error?.rateLimit || null,
  })
}

export async function requestMistralModel({
  apiKey,
  modelName = MISTRAL_PRIMARY_MODEL,
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
    const response = await fetch(MISTRAL_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 's-hub-server/2.0',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: [{ type: 'text', text: structuredPrompt(prompt, responseSchema) }, ...attachments] }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 's_hub_result',
            schema: responseSchema,
            strict: true,
          },
        },
        temperature,
        max_tokens: maxOutputTokens,
      }),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }

    if (!response.ok) {
      const message = String(payload?.message || payload?.error?.message || `Mistral AI HTTP ${response.status}`)
      const code = String(payload?.code || payload?.error?.code || `http-${response.status}`)
      const error = aiError(message, response.status, code)
      error.rateLimit = rateLimitMetadata(response)
      throw error
    }

    const generated = responseText(payload)
    if (!generated) throw aiError('Mistral AI returned an empty response', 502, 'empty_response')

    let value = null
    try {
      value = JSON.parse(generated)
    } catch {
      throw aiError('Mistral AI returned invalid JSON', 502, 'invalid_json')
    }

    const servedModelName = String(payload?.model || modelName || MISTRAL_PRIMARY_MODEL).trim() || MISTRAL_PRIMARY_MODEL
    return { value, usage: usageInfo(payload), modelName: servedModelName }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw aiError(`Mistral AI ${modelName} timed out`, 504, 'model_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function requestOpenRouterModel({
  apiKey,
  modelName,
  modelNames,
  prompt,
  attachments,
  responseSchema,
  maxOutputTokens,
  temperature,
  timeoutMs,
  useResponseFormat = true,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const routingModels = safeRoutingModels(modelName, modelNames)
  try {
    const body = {
      messages: [{ role: 'user', content: [{ type: 'text', text: structuredPrompt(prompt, responseSchema) }, ...attachments] }],
      temperature,
      max_tokens: maxOutputTokens,
    }
    if (useResponseFormat) body.response_format = { type: 'json_object' }
    if (routingModels.length > 1) body.models = routingModels
    else body.model = routingModels[0]
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
    const value = parseGeneratedJson(generated)

    const servedModelName = String(payload?.model || routingModels[0] || DEFAULT_MODEL).trim() || routingModels[0]
    return { value, usage: usageInfo(payload), modelName: servedModelName }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw aiError(`OpenRouter AI ${routingModels[0]} timed out`, 504, 'model_timeout')
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
  const mistralApiKey = String(process.env.MISTRAL_API_KEY || '').trim()
  const openRouterApiKey = String(process.env.OPENROUTER_API_KEY || '').trim()
  const safePrompt = String(prompt || '').trim().slice(0, 40_000)
  const safeModelName = String(modelName || DEFAULT_MODEL).trim() || DEFAULT_MODEL
  const routingModels = safeModelName === DEFAULT_MODEL ? [...OPENROUTER_MODEL_CHAIN] : [safeModelName]
  if (!mistralApiKey && !openRouterApiKey) throw aiError('No AI provider API key is configured', 503, 'ai_not_configured')
  if (!safePrompt) throw aiError('Missing AI prompt', 400, 'invalid_request')

  const rawAttachments = Array.isArray(attachments) ? attachments.slice(0, 4) : []
  const contentParts = safeAttachments(rawAttachments)
  const mistralContentParts = safeMistralAttachments(rawAttachments)
  const schema = safeSchema(responseSchema)
  const outputTokens = Math.round(clamp(maxOutputTokens, 200, 5000, 1600))
  const imageRequest = safeModelName === DEFAULT_MODEL && hasImageAttachment(contentParts)
  const overallTimeout = Math.round(
    imageRequest
      ? clamp(Math.max(Number(timeoutMs) || 0, MIN_IMAGE_REQUEST_TIMEOUT_MS), 5000, 52_000, MIN_IMAGE_REQUEST_TIMEOUT_MS)
      : safeModelName === DEFAULT_MODEL
        ? clamp(Math.max(Number(timeoutMs) || 0, MIN_TEXT_REQUEST_TIMEOUT_MS), 5000, 52_000, MIN_TEXT_REQUEST_TIMEOUT_MS)
        : clamp(timeoutMs, 5000, 52_000, 26_000),
  )
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

  if (mistralApiKey && safeModelName === DEFAULT_MODEL) {
    for (const mistralModelName of MISTRAL_MODEL_CHAIN) {
      const remaining = deadline - Date.now()
      if (remaining < 2500) break

      const attemptCap = mistralContentParts.length ? MISTRAL_ATTACHMENT_TIMEOUT_MS : MISTRAL_TEXT_TIMEOUT_MS
      const attemptTimeout = Math.max(2000, Math.min(remaining, attemptCap))
      const startedAt = Date.now()

      try {
        const result = await requestMistralModel({
          apiKey: mistralApiKey,
          modelName: mistralModelName,
          prompt: safePrompt,
          attachments: mistralContentParts,
          responseSchema: schema,
          maxOutputTokens: outputTokens,
          temperature: safeTemperature,
          timeoutMs: attemptTimeout,
        })
        return {
          value: result.value,
          modelName: result.modelName || mistralModelName,
          attempts,
          usage: result.usage,
        }
      } catch (error) {
        lastError = error
        attempts.push(`mistral ${mistralModelName}: ${String(error?.code || error?.status || 'error')} (${Date.now() - startedAt}ms)`)
        if (Number(error?.status) === 429) {
          logRateLimitDiagnostic('mistral rate-limit diagnostic', requestMeta, error, mistralModelName)
        }
        if (!shouldFallbackFromMistral(error)) {
          const finalError = new Error(error?.message || 'Mistral AI request failed')
          finalError.status = Number(error?.status || 502)
          finalError.code = String(error?.code || 'ai_request_failed')
          finalError.attempts = attempts
          finalError.rateLimit = error?.rateLimit || null
          finalError.requestMeta = requestMeta
          throw finalError
        }
      }
    }
  }

  if (!openRouterApiKey) {
    const error = new Error(lastError?.message || 'OpenRouter fallback is not configured')
    error.status = Number(lastError?.status || 503)
    error.code = String(lastError?.code || 'openrouter_not_configured')
    error.attempts = attempts
    error.rateLimit = lastError?.rateLimit || null
    error.requestMeta = requestMeta
    throw error
  }

  if (imageRequest) {
    for (const imageModelName of IMAGE_MODEL_CHAIN) {
      const remaining = deadline - Date.now()
      if (remaining < 2500) break
      const attemptTimeout = Math.max(2000, Math.min(remaining, IMAGE_MODEL_TIMEOUT_MS))
      const startedAt = Date.now()

      try {
        const result = await requestOpenRouterModel({
          apiKey: openRouterApiKey,
          modelName: imageModelName,
          prompt: safePrompt,
          attachments: contentParts,
          responseSchema: schema,
          maxOutputTokens: outputTokens,
          temperature: safeTemperature,
          timeoutMs: attemptTimeout,
          useResponseFormat: supportsResponseFormat(imageModelName),
        })
        return {
          value: result.value,
          modelName: result.modelName || imageModelName,
          attempts,
          usage: result.usage,
        }
      } catch (error) {
        lastError = error
        attempts.push(`${imageModelName}: ${String(error?.code || error?.status || 'error')} (${Date.now() - startedAt}ms)`)
        if (Number(error?.status) === 429) {
          logRateLimitDiagnostic('openrouter image-route rate-limit diagnostic', requestMeta, error, imageModelName)
        }
        if (!shouldTryNextImageModel(error)) break
      }
    }
  } else {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const remaining = deadline - Date.now()
      if (remaining < 2500) break
      const attemptCap = contentParts.length ? 30_000 : 12_000
      const attemptTimeout = Math.max(2000, Math.min(remaining, attemptCap))
      const startedAt = Date.now()

      try {
        const result = await requestOpenRouterModel({
          apiKey: openRouterApiKey,
          modelName: safeModelName,
          modelNames: routingModels,
          prompt: safePrompt,
          attachments: contentParts,
          responseSchema: schema,
          maxOutputTokens: outputTokens,
          temperature: safeTemperature,
          timeoutMs: attemptTimeout,
        })
        return {
          value: result.value,
          modelName: result.modelName || safeModelName,
          attempts,
          usage: result.usage,
        }
      } catch (error) {
        lastError = error
        attempts.push(`${routingModels.join(' -> ')}: ${String(error?.code || error?.status || 'error')} (${Date.now() - startedAt}ms)`)
        if (Number(error?.status) === 429) {
          logRateLimitDiagnostic('openrouter rate-limit diagnostic', requestMeta, error, routingModels.join(' -> '))
        }
        if (String(error?.code || '') === 'model_timeout' || String(error?.code || '') === 'empty_response' || String(error?.code || '') === 'invalid_json') break
        if (!shouldRetry(error)) break
      }
    }

    if (safeModelName === DEFAULT_MODEL && shouldTryTextRecovery(lastError)) {
      for (const recoveryModelName of TEXT_RECOVERY_MODEL_CHAIN) {
        const remaining = deadline - Date.now()
        if (remaining < 2500) break
        const attemptTimeout = Math.max(2000, Math.min(remaining, TEXT_RECOVERY_MODEL_TIMEOUT_MS))
        const startedAt = Date.now()

        try {
          const result = await requestOpenRouterModel({
            apiKey: openRouterApiKey,
            modelName: recoveryModelName,
            prompt: safePrompt,
            attachments: contentParts,
            responseSchema: schema,
            maxOutputTokens: outputTokens,
            temperature: safeTemperature,
            timeoutMs: attemptTimeout,
            useResponseFormat: supportsResponseFormat(recoveryModelName),
          })
          return {
            value: result.value,
            modelName: result.modelName || recoveryModelName,
            attempts,
            usage: result.usage,
          }
        } catch (error) {
          lastError = error
          attempts.push(`recovery ${recoveryModelName}: ${String(error?.code || error?.status || 'error')} (${Date.now() - startedAt}ms)`)
          if (Number(error?.status) === 429) {
            logRateLimitDiagnostic('openrouter text-recovery rate-limit diagnostic', requestMeta, error, recoveryModelName)
          }
          if (!shouldTryTextRecovery(error) && Number(error?.status) !== 429) break
        }
      }
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
