
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
