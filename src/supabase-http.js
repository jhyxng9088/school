const SUPABASE_HOST = 'elhlsqhzjmsfhmawrpqu.supabase.co'
const RELAY_BASE_URL = 'https://school-reminder-backend.vercel.app/api/supabase-relay'
const DIRECT_TIMEOUT_MS = 1600
const RELAY_TIMEOUT_MS = 12_000
const DIRECT_FAILURE_COOLDOWN_MS = 60_000

let directBlockedUntil = 0

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function parseSupabaseFunctionUrl(input) {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(String(input))
  const match = /^\/functions\/v1\/([a-z0-9-]+)\/?$/i.exec(url.pathname)
  if (url.hostname !== SUPABASE_HOST || !match) {
    throw new Error('Unsupported Supabase function URL')
  }
  return { url, target: match[1] }
}

function relayUrlFor(url, target) {
  const relay = new URL(RELAY_BASE_URL)
  relay.searchParams.set('target', target)
  url.searchParams.forEach((value, key) => relay.searchParams.append(key, value))
  return relay
}

function likelyFilteredResponse(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) return false
  return response?.status === 403
    || response?.status === 451
    || (response?.ok === true && contentType.includes('text/html'))
}

async function fetchAttempt(input, init, timeoutMs) {
  const callerSignal = init?.signal
  if (callerSignal?.aborted) throw abortError()

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  callerSignal?.addEventListener?.('abort', abortFromCaller, { once: true })

  const timeoutId = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
    : null

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (callerSignal?.aborted) throw abortError()
    if (timedOut) {
      const timeoutError = new Error('Supabase request timed out')
      timeoutError.name = 'SupabaseDirectTimeoutError'
      throw timeoutError
    }
    throw error
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId)
    callerSignal?.removeEventListener?.('abort', abortFromCaller)
  }
}

export function supabaseDirectTemporarilyBlocked() {
  return Date.now() < directBlockedUntil
}

export async function fetchSupabaseFunction(input, init = {}, { safeToRetry = false } = {}) {
  const { url, target } = parseSupabaseFunctionUrl(input)
  const method = String(init?.method || 'GET').toUpperCase()
  const canRetry = safeToRetry || method === 'GET' || method === 'HEAD'
  const relayUrl = relayUrlFor(url, target)

  if (supabaseDirectTemporarilyBlocked()) {
    return fetchAttempt(relayUrl, init, RELAY_TIMEOUT_MS)
  }

  try {
    const response = await fetchAttempt(url, init, canRetry ? DIRECT_TIMEOUT_MS : 0)
    if (canRetry && likelyFilteredResponse(response)) {
      directBlockedUntil = Date.now() + DIRECT_FAILURE_COOLDOWN_MS
      return fetchAttempt(relayUrl, init, RELAY_TIMEOUT_MS)
    }
    directBlockedUntil = 0
    return response
  } catch (error) {
    if (init?.signal?.aborted) throw error
    if (!canRetry) throw error
    directBlockedUntil = Date.now() + DIRECT_FAILURE_COOLDOWN_MS
    return fetchAttempt(relayUrl, init, RELAY_TIMEOUT_MS)
  }
}
