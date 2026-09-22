const SUPABASE_HOST = 'elhlsqhzjmsfhmawrpqu.supabase.co'
const RELAY_BASE_URL = 'https://school-reminder-backend.vercel.app/api/supabase-relay'
const DIRECT_TIMEOUT_MS = 900
const RELAY_TIMEOUT_MS = 12_000
const DIRECT_FAILURE_COOLDOWN_MS = 60_000
const RELAY_PREFERENCE_TTL_MS = 6 * 60 * 60_000
const RELAY_PREFERENCE_KEY = 'school.supabaseRelayUntil.v1'

function storedRelayUntil() {
  try {
    const value = Number(globalThis.localStorage?.getItem?.(RELAY_PREFERENCE_KEY) || 0)
    if (Number.isFinite(value) && value > Date.now()) return value
    if (value) globalThis.localStorage?.removeItem?.(RELAY_PREFERENCE_KEY)
  } catch {
    // Storage can be unavailable in private/restricted contexts. Session fallback still works.
  }
  return 0
}

let persistedRelayUntil = storedRelayUntil()
let directBlockedUntil = persistedRelayUntil

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

function relayLooksReachable(response) {
  return Boolean(response) && ![404, 502, 504].includes(response.status)
}

function markDirectUnavailable({ persist = false } = {}) {
  directBlockedUntil = Math.max(directBlockedUntil, Date.now() + DIRECT_FAILURE_COOLDOWN_MS)
  if (!persist || persistedRelayUntil > Date.now()) return

  persistedRelayUntil = Date.now() + RELAY_PREFERENCE_TTL_MS
  directBlockedUntil = Math.max(directBlockedUntil, persistedRelayUntil)
  try {
    globalThis.localStorage?.setItem?.(RELAY_PREFERENCE_KEY, String(persistedRelayUntil))
  } catch {
    // Keep the in-memory route preference when persistent storage is unavailable.
  }
}

function clearDirectUnavailable() {
  directBlockedUntil = 0
  persistedRelayUntil = 0
  try {
    globalThis.localStorage?.removeItem?.(RELAY_PREFERENCE_KEY)
  } catch {
    // No-op.
  }
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
    try {
      const relayResponse = await fetchAttempt(relayUrl, init, RELAY_TIMEOUT_MS)
      if (relayLooksReachable(relayResponse)) {
        markDirectUnavailable({ persist: true })
        return relayResponse
      }
      if (!canRetry) return relayResponse

      const directResponse = await fetchAttempt(url, init, DIRECT_TIMEOUT_MS)
      clearDirectUnavailable()
      return directResponse
    } catch (relayError) {
      if (!canRetry || init?.signal?.aborted) throw relayError
      const directResponse = await fetchAttempt(url, init, DIRECT_TIMEOUT_MS)
      clearDirectUnavailable()
      return directResponse
    }
  }

  try {
    const response = await fetchAttempt(url, init, canRetry ? DIRECT_TIMEOUT_MS : 0)
    if (canRetry && likelyFilteredResponse(response)) {
      markDirectUnavailable()
      const relayResponse = await fetchAttempt(relayUrl, init, RELAY_TIMEOUT_MS)
      if (relayLooksReachable(relayResponse)) markDirectUnavailable({ persist: true })
      return relayResponse
    }
    clearDirectUnavailable()
    return response
  } catch (error) {
    if (init?.signal?.aborted) throw error
    if (!canRetry) throw error

    markDirectUnavailable()
    const relayResponse = await fetchAttempt(relayUrl, init, RELAY_TIMEOUT_MS)
    if (relayLooksReachable(relayResponse)) markDirectUnavailable({ persist: true })
    return relayResponse
  }
}
