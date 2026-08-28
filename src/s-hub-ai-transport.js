
import { ensureSignedIn } from './school-sync'

const S_HUB_AI_API_URL = 'https://school-reminder-backend.vercel.app/api/s-hub-ai'
const MAX_TOTAL_ATTACHMENT_BASE64_CHARS = 3_000_000
const MAX_CLIENT_TIMEOUT_MS = 58_000
const MEAL_CACHE_KEY = 'school.stage3.meals.v1'

function transportError(message, code, status = null, attempts = []) {
  const error = new Error(message)
  error.name = 'SchoolAITransportError'
  error.code = code
  error.status = status
  error.customData = { attempts: Array.isArray(attempts) ? attempts : [] }
  return error
}

function dateKeyFromRaw(rawDate) {
  const value = String(rawDate || '')
  if (!/^\d{8}$/.test(value)) return ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function cachedMealContext() {
  try {
    const raw = globalThis.localStorage?.getItem(MEAL_CACHE_KEY)
    const store = raw ? JSON.parse(raw) : null
    const ranges = store?.ranges && typeof store.ranges === 'object' ? store.ranges : {}
    const meals = []
    const seen = new Set()

    Object.values(ranges).forEach((entry) => {
      if (!Array.isArray(entry?.meals)) return
      entry.meals.forEach((meal) => {
        const date = dateKeyFromRaw(meal?.rawDate)
        const mealCode = String(meal?.mealCode || '')
        const key = `${date}|${mealCode}`
        if (!date || seen.has(key)) return
        seen.add(key)
        const dishes = Array.isArray(meal?.dishes)
          ? meal.dishes.map((dish) => String(dish || '').trim()).filter(Boolean).slice(0, 24)
          : []
        if (!dishes.length) return
        meals.push({
          date,
          mealCode,
          mealName: String(meal?.mealName || '중식').trim().slice(0, 20),
          dishes,
          calories: String(meal?.calories || '').trim().slice(0, 40),
        })
      })
    })

    return meals
      .sort((a, b) => `${a.date}-${a.mealCode}`.localeCompare(`${b.date}-${b.mealCode}`))
      .slice(-30)
  } catch {
    return []
  }
}

function enrichSchoolPromptWithMeals(prompt, purpose) {
  if (purpose === 'reminder') return prompt
  const meals = cachedMealContext()
  if (!meals.length) return prompt
  return `${prompt}\n\n추가 SCHOOL_DATA - NEIS 급식 캐시(이 데이터도 SCHOOL_DATA의 일부로 취급):\n${JSON.stringify({ meals })}`
}

export async function generateSchoolStructured({
  prompt = '',
  attachments = [],
  responseSchema,
  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
  purpose = 'school',
  cacheScope = '',
  signal = null,
} = {}) {
  const safePrompt = String(prompt || '').trim()
  if (!safePrompt || !responseSchema || typeof responseSchema !== 'object') {
    throw transportError('AI 요청 정보가 올바르지 않아.', 'school-ai/invalid-request', 400)
  }
  const enrichedPrompt = enrichSchoolPromptWithMeals(safePrompt, purpose)

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
  const callerSignal = signal && typeof signal.addEventListener === 'function' ? signal : null
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

  const clientTimeout = Math.min(
    MAX_CLIENT_TIMEOUT_MS,
    Math.max(12_000, Number(timeoutMs || 26000) + 10_000),
  )
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, clientTimeout)

  try {
    const response = await fetch(S_HUB_AI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purpose: purpose === 'reminder' ? 'reminder' : 'school',
        prompt: enrichedPrompt.slice(0, 40_000),
        attachments: safeAttachments,
        responseSchema,
        maxOutputTokens,
        timeoutMs,
        temperature,
        cacheScope: cacheScope === 'school-question' ? 'school-question' : '',
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
      if (!timedOut && callerSignal?.aborted) {
        throw transportError('S-Hub AI 요청을 취소했어.', 'school-ai/cancelled', 499)
      }
      throw transportError('AI 응답 시간이 초과됐어. 다시 시도해줘.', 'school-ai/server-timeout', 504)
    }
    if (error?.name === 'SchoolAITransportError') throw error
    throw transportError('AI 서버에 연결하지 못했어. 네트워크를 확인하고 다시 시도해줘.', 'school-ai/network-error')
  } finally {
    window.clearTimeout(timeoutId)
    callerSignal?.removeEventListener?.('abort', abortFromCaller)
  }
}
