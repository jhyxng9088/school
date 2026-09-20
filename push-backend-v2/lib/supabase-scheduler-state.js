import { adminAuth } from './firebase-admin.js'

const SUPABASE_SCHEDULER_STATE_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/push-scheduler-state'
const FIREBASE_WEB_API_KEY = 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0'
const SCHEDULER_UID = 's-hub-scheduler'
const REQUEST_TIMEOUT_MS = 2200

let cachedToken = ''
let cachedTokenExpiresAt = 0

async function schedulerIdToken() {
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) return cachedToken

  const customToken = await adminAuth().createCustomToken(SCHEDULER_UID)
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      cache: 'no-store',
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.idToken) {
    throw new Error(`scheduler Firebase token exchange failed: ${response.status || 0}`)
  }

  cachedToken = String(payload.idToken)
  const expiresInSeconds = Math.max(60, Number(payload.expiresIn || 3600))
  cachedTokenExpiresAt = Date.now() + expiresInSeconds * 1000
  return cachedToken
}

async function schedulerRequest(method, body = null) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const token = await schedulerIdToken()
    const response = await fetch(SUPABASE_SCHEDULER_STATE_URL, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload?.ok !== true) {
      throw new Error(String(payload?.error || `http_${response.status || 0}`))
    }
    return payload
  } finally {
    clearTimeout(timeout)
  }
}

export async function loadSupabaseSchedulerRuntime() {
  try {
    const payload = await schedulerRequest('GET')
    const runtime = payload?.runtime && typeof payload.runtime === 'object' ? payload.runtime : {}
    return {
      available: true,
      runtime: {
        lastSuccessMs: Math.max(0, Number(runtime.lastSuccessMs || 0)),
        updatedAtMs: Math.max(0, Number(runtime.updatedAtMs || 0)),
        checkedWindows: Math.max(0, Number(runtime.checkedWindows || 0)),
        lastSummary: runtime.lastSummary && typeof runtime.lastSummary === 'object' ? runtime.lastSummary : {},
        subscriptionWatermarkMs: Math.max(0, Number(runtime.subscriptionWatermarkMs || 0)),
        subscriptionFullSyncMs: Math.max(0, Number(runtime.subscriptionFullSyncMs || 0)),
      },
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error || 'unknown')
    console.warn('Supabase scheduler runtime unavailable; using Firestore fallback.', { reason })
    return { available: false, runtime: null }
  }
}

export async function saveSupabaseSchedulerRuntime(runtime) {
  try {
    await schedulerRequest('POST', { action: 'save-runtime', runtime })
    return true
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error || 'unknown')
    console.warn('Supabase scheduler runtime write skipped; Firestore shadow remains.', { reason })
    return false
  }
}
