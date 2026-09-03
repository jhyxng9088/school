const SUPABASE_PRESENCE_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-presence'
const SUPABASE_PRESENCE_TIMEOUT_MS = 1_800

export async function loadSupabaseClassPresence({ token, classId } = {}) {
  const idToken = String(token || '').trim()
  const expectedClassId = String(classId || '').trim()
  if (!idToken || !expectedClassId) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPABASE_PRESENCE_TIMEOUT_MS)
  try {
    const response = await fetch(SUPABASE_PRESENCE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'heartbeat' }),
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok || String(payload.classId || '') !== expectedClassId) {
      throw new Error(String(payload?.error || `http_${response.status || 0}`))
    }
    const nowMs = Date.now()
    const keys = [...new Set((Array.isArray(payload.activeStudentKeys) ? payload.activeStudentKeys : [])
      .map((value) => String(value || '').trim().slice(0, 120))
      .filter((value) => value.length >= 16))]
    return {
      online: keys.length,
      presence: keys.map((studentKey) => ({ studentKey, lastSeenMs: nowMs })),
      generatedAt: Math.max(0, Number(payload.generatedAt || nowMs)),
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error || 'unknown')
    console.warn('Supabase class presence unavailable; using Firestore fallback.', { reason })
    return null
  } finally {
    clearTimeout(timeout)
  }
}
