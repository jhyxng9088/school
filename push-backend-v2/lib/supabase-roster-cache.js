const SUPABASE_ROSTER_IDENTITIES_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-roster-identities'
const SUPABASE_ROSTER_TIMEOUT_MS = 1_800

function cleanText(value, max) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max)
}

export function normalizeSupabaseRosterIdentities(payload, expectedClassId = '') {
  const classId = cleanText(payload?.classId, 32)
  const expected = cleanText(expectedClassId, 32)
  if (!payload?.ok || !classId || (expected && classId !== expected)) return []

  const byStudentKey = new Map()
  for (const value of Array.isArray(payload.identities) ? payload.identities : []) {
    const studentKey = cleanText(value?.studentKey, 120)
    const name = cleanText(value?.name, 20)
    if (studentKey.length < 16 || !name) continue
    const verifiedAt = Math.max(0, Number(value?.verifiedAt || 0))
    const cacheUpdatedAt = Math.max(0, Number(value?.updatedAt || verifiedAt || 0))
    const existing = byStudentKey.get(studentKey)
    if (!existing || cacheUpdatedAt >= existing.cacheUpdatedAt) {
      byStudentKey.set(studentKey, {
        classId,
        studentKey,
        name,
        // Supabase is an identity cache, not the source of truth for roster chronology.
        // Keep ordering timestamps neutral so cached rows can never outrank Firestore rows.
        createdAt: 0,
        updatedAt: 0,
        cacheUpdatedAt,
      })
    }
  }
  return [...byStudentKey.values()]
}

export function supabaseRosterCacheCoversMembers(users = [], memberKeys = new Set()) {
  const keys = memberKeys instanceof Set ? memberKeys : new Set(memberKeys || [])
  if (!keys.size) return false
  const cachedKeys = new Set(
    (Array.isArray(users) ? users : [])
      .map((user) => cleanText(user?.studentKey, 120))
      .filter(Boolean),
  )
  return [...keys].every((studentKey) => cachedKeys.has(studentKey))
}

export async function loadSupabaseRosterIdentities({ token, classId, memberKeys } = {}) {
  const idToken = String(token || '').trim()
  const expectedClassId = cleanText(classId, 32)
  if (!idToken || !expectedClassId) return { users: [], complete: false, available: false }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SUPABASE_ROSTER_TIMEOUT_MS)
  try {
    const response = await fetch(SUPABASE_ROSTER_IDENTITIES_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.error || `http_${response.status || 0}`))
    }
    const users = normalizeSupabaseRosterIdentities(payload, expectedClassId)
    return {
      users,
      complete: supabaseRosterCacheCoversMembers(users, memberKeys),
      available: true,
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error || 'unknown')
    console.warn('Supabase roster identity cache unavailable; using Firestore fallback.', { reason })
    return { users: [], complete: false, available: false }
  } finally {
    clearTimeout(timeout)
  }
}
