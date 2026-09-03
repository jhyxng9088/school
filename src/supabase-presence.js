const SUPABASE_PRESENCE_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-presence'
const PRESENCE_REFRESH_MS = 45_000

function safeStudentKeys(value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source
    .map((item) => String(item || '').trim().slice(0, 120))
    .filter((item) => item.length >= 16))]
}

function dispatchPresenceSnapshot(classId, online, activeStudentKeys) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('school:class-presence', {
      detail: {
        classId: String(classId || ''),
        online: Math.max(0, Number(online || 0)),
        activeStudentKeys: safeStudentKeys(activeStudentKeys),
        receivedAt: Date.now(),
      },
    }))
  } catch {
    // Presence transport remains usable when CustomEvent is unavailable.
  }
}

async function requestPresence(user, classId, action, signal) {
  if (!user?.getIdToken || !classId) throw new Error('접속 상태 로그인 정보를 확인하지 못했어요.')
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw new Error('접속 상태 로그인 정보를 확인하지 못했어요.')
  const response = await fetch(SUPABASE_PRESENCE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action }),
    cache: 'no-store',
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    const error = new Error(String(body?.message || '접속 상태를 확인하지 못했어요.'))
    error.code = String(body?.error || `presence/http-${response.status || 0}`)
    throw error
  }
  return body
}

export function startSupabasePresence({
  user,
  classId,
  onOnlineCount,
  onError = () => {},
  onUnavailable = () => {},
}) {
  if (!user?.getIdToken || !classId || typeof window === 'undefined') return null

  let stopped = false
  let timerId = 0
  let requestController = null
  let unavailableReported = false
  let refreshPromise = null

  function clearTimer() {
    if (!timerId) return
    window.clearInterval(timerId)
    timerId = 0
  }

  function reportUnavailable(error) {
    onError(error)
    if (stopped || unavailableReported) return
    unavailableReported = true
    queueMicrotask(() => {
      if (!stopped) onUnavailable(error)
    })
  }

  async function heartbeat() {
    if (stopped || document.hidden) return false
    if (refreshPromise) return refreshPromise
    requestController?.abort()
    requestController = new AbortController()
    const controller = requestController
    refreshPromise = requestPresence(user, classId, 'heartbeat', controller.signal)
      .then((body) => {
        if (stopped || controller.signal.aborted) return false
        unavailableReported = false
        const online = Math.max(0, Number(body?.online || 0))
        const activeStudentKeys = safeStudentKeys(body?.activeStudentKeys)
        onOnlineCount(online)
        dispatchPresenceSnapshot(classId, online, activeStudentKeys)
        return true
      })
      .catch((error) => {
        if (error?.name === 'AbortError' || stopped) return false
        reportUnavailable(error)
        return false
      })
      .finally(() => {
        if (refreshPromise && requestController === controller) refreshPromise = null
      })
    return refreshPromise
  }

  function ensureTimer() {
    if (timerId || stopped) return
    timerId = window.setInterval(() => {
      void heartbeat()
    }, PRESENCE_REFRESH_MS)
  }

  async function enter() {
    if (stopped) return false
    ensureTimer()
    return heartbeat()
  }

  async function leave() {
    clearTimer()
    requestController?.abort()
    requestController = null
    refreshPromise = null
    if (stopped) return false
    try {
      await requestPresence(user, classId, 'leave')
      return true
    } catch (error) {
      if (error?.name !== 'AbortError') onError(error)
      return false
    }
  }

  const handleVisibility = () => {
    if (document.hidden) void leave()
    else void enter()
  }
  const handleFocus = () => {
    if (!document.hidden) void enter()
  }
  const handleOnline = () => {
    if (!document.hidden) void enter()
  }

  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('online', handleOnline)
  if (!document.hidden) void enter()

  return {
    enter,
    leave,
    stop() {
      if (stopped) return
      stopped = true
      clearTimer()
      requestController?.abort()
      requestController = null
      refreshPromise = null
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      // Best-effort cleanup cannot block component teardown.
      void requestPresence(user, classId, 'leave').catch(() => {})
    },
  }
}

export const SUPABASE_PRESENCE_REFRESH_MS = PRESENCE_REFRESH_MS
