function replaceExact(source, marker, replacement) {
  const count = String(source || '').split(marker).length - 1
  if (count !== 1) {
    throw new Error(`S-Hub presence patch drift: expected 1 occurrence, found ${count}: ${marker.slice(0, 90)}`)
  }
  return source.replace(marker, replacement)
}

function replaceBetween(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`S-Hub presence patch drift: start marker missing: ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  if (end < 0) throw new Error(`S-Hub presence patch drift: end marker missing: ${endMarker}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const PRESENCE_HOOK = `export function useClassPresence(profile) {
  const signature = profileSignature(profile)
  const [counts, setCounts] = useState({ online: 0, total: 0 })

  useEffect(() => {
    if (!signature) return undefined

    let stopped = false
    let refreshTimer = null
    let supabasePresence = null
    let realtimePresence = null
    let fallbackLevel = 'supabase'
    let stopActiveTransport = () => {}
    const classId = classKeyFor(profile)
    const studentKey = studentKeyFor(profile)
    const memberCountCacheKey = \`school.presenceMemberCount.v1.\${classId}\`
    const MEMBER_COUNT_CACHE_MS = 30 * 60 * 1000

    function readCachedMemberCount({ allowStale = false } = {}) {
      try {
        const cached = JSON.parse(localStorage.getItem(memberCountCacheKey) || 'null')
        if (!cached) return null
        const total = Number(cached.total)
        if (!Number.isInteger(total) || total < 0) return null
        if (!allowStale && Date.now() - Number(cached.checkedAt || 0) > MEMBER_COUNT_CACHE_MS) return null
        return total
      } catch {
        return null
      }
    }

    function cacheMemberCount(total) {
      try {
        localStorage.setItem(memberCountCacheKey, JSON.stringify({ total, checkedAt: Date.now() }))
      } catch {
        // Presence accuracy never depends on local cache availability.
      }
    }

    const cachedTotal = readCachedMemberCount({ allowStale: true })
    if (cachedTotal !== null) setCounts((current) => ({ ...current, total: cachedTotal }))

    const refreshMemberTotal = async ({ force = false } = {}) => {
      const cached = force ? null : readCachedMemberCount()
      if (cached !== null) {
        if (!stopped) setCounts((current) => ({ ...current, total: cached }))
        return cached
      }
      const snapshot = await getCountFromServer(classMembersCollection(profile))
      const total = Number(snapshot.data().count || 0)
      cacheMemberCount(total)
      if (!stopped) setCounts((current) => ({ ...current, total }))
      return total
    }

    const ensureMemberBestEffort = async () => {
      try {
        const member = classMemberRef(profile)
        const existing = await getDoc(member)
        if (!existing.exists()) {
          await setDoc(member, { joinedAt: Date.now() })
          try { localStorage.removeItem(memberCountCacheKey) } catch { /* best effort */ }
          await refreshMemberTotal({ force: true })
        } else {
          await refreshMemberTotal()
        }
      } catch (error) {
        // Firestore membership bookkeeping is independent from the live presence transport.
        console.error('Class member count refresh failed:', error)
      }
    }

    const startFirestoreFallback = () => {
      const heartbeat = async () => {
        if (stopped || document.hidden) return
        await ensureSignedIn()
        if (stopped) return
        await setDoc(classPresenceRef(profile), {
          studentKey,
          lastSeenMs: Date.now(),
        })
      }

      const recountOnline = async () => {
        if (stopped) return
        await ensureSignedIn()
        if (stopped) return
        const threshold = Date.now() - PRESENCE_ACTIVE_MS
        const onlineSnapshot = await getCountFromServer(query(
          classPresenceCollection(profile),
          where('lastSeenMs', '>=', threshold),
        ))
        if (!stopped) setCounts((current) => ({ ...current, online: Number(onlineSnapshot.data().count || 0) }))
      }

      const refreshPresence = async () => {
        if (stopped || document.hidden) return
        try {
          await heartbeat()
          await recountOnline()
          void refreshMemberTotal().catch((error) => console.error('Class member count refresh failed:', error))
        } catch (error) {
          console.error('Class presence Firestore fallback failed:', error)
        }
      }

      const handleVisibility = () => {
        if (!document.hidden) void refreshPresence()
      }

      void refreshPresence()
      refreshTimer = window.setInterval(refreshPresence, 30 * 1000)
      document.addEventListener('visibilitychange', handleVisibility)
      window.addEventListener('focus', refreshPresence)

      return () => {
        if (refreshTimer) {
          window.clearInterval(refreshTimer)
          refreshTimer = null
        }
        document.removeEventListener('visibilitychange', handleVisibility)
        window.removeEventListener('focus', refreshPresence)
      }
    }

    const activateFirestoreFallback = (reason) => {
      if (stopped || fallbackLevel === 'firestore') return
      fallbackLevel = 'firestore'
      stopActiveTransport()
      stopActiveTransport = () => {}
      supabasePresence?.stop()
      supabasePresence = null
      realtimePresence?.stop()
      realtimePresence = null
      if (reason) console.warn('External presence unavailable; using Firestore fallback.', reason)
      stopActiveTransport = startFirestoreFallback()
    }

    const activateRealtimeFallback = (reason) => {
      if (stopped || fallbackLevel !== 'supabase') return
      fallbackLevel = 'rtdb'
      supabasePresence?.stop()
      supabasePresence = null
      if (reason) console.warn('Supabase presence unavailable; trying Realtime Database.', reason)

      if (realtimePresenceConfigured()) {
        realtimePresence = startRealtimePresence({
          app: syncApp,
          classId,
          uid: auth.currentUser?.uid,
          onOnlineCount: (online) => {
            if (!stopped && fallbackLevel === 'rtdb') setCounts((current) => ({ ...current, online }))
          },
          onError: (error) => console.error('Realtime Database presence failed:', error),
          onUnavailable: activateFirestoreFallback,
        })
      }

      if (!realtimePresence) {
        activateFirestoreFallback(reason)
        return
      }

      const handleVisibility = () => {
        if (document.hidden) void realtimePresence?.leave()
        else void realtimePresence?.enter()
      }
      document.addEventListener('visibilitychange', handleVisibility)
      window.addEventListener('focus', handleVisibility)
      stopActiveTransport = () => {
        document.removeEventListener('visibilitychange', handleVisibility)
        window.removeEventListener('focus', handleVisibility)
      }
    }

    ensureSignedIn()
      .then((user) => {
        if (stopped) return

        // Registration/total are low-frequency Firestore bookkeeping. Live presence is
        // Supabase-first so normal 30-45 second heartbeats do not spend Firestore reads.
        void ensureMemberBestEffort()

        supabasePresence = startSupabasePresence({
          user,
          classId,
          onOnlineCount: (online) => {
            if (!stopped && fallbackLevel === 'supabase') setCounts((current) => ({ ...current, online }))
          },
          onError: (error) => console.error('Supabase presence failed:', error),
          onUnavailable: activateRealtimeFallback,
        })

        if (!supabasePresence) activateRealtimeFallback()
      })
      .catch((error) => {
        console.error('Class presence connection failed:', error)
        activateRealtimeFallback(error)
      })

    return () => {
      stopped = true
      stopActiveTransport()
      supabasePresence?.stop()
      realtimePresence?.stop()
    }
  }, [signature])

  return counts
}
`

export function patchPresenceSplitSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/src/school-sync.js')) return String(source || '')

  let next = String(source || '')
  next = replaceExact(
    next,
    "import { publishClassLiveData } from './class-live-data.js'",
    "import { publishClassLiveData } from './class-live-data.js'\nimport { realtimePresenceConfigured, startRealtimePresence } from './presence-rtdb.js'\nimport { startSupabasePresence } from './supabase-presence.js'",
  )
  next = replaceBetween(
    next,
    'export function useClassPresence(profile) {',
    '\nexport async function writeSharedTodo',
    PRESENCE_HOOK,
  )
  return next
}
