import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database'

const DATABASE_URL = String(import.meta.env.VITE_FIREBASE_DATABASE_URL || '').trim()

export function realtimePresenceConfigured() {
  return /^https:\/\/[a-z0-9-]+(?:-default-rtdb)?(?:\.[a-z0-9-]+)?\.(?:firebaseio\.com|firebasedatabase\.app)\/?$/i.test(DATABASE_URL)
}

function safePathPart(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
}

export function startRealtimePresence({ app, classId, uid, studentKey, onOnlineCount, onError = () => {} }) {
  if (!realtimePresenceConfigured() || !app) return null
  const safeClassId = safePathPart(classId)
  const safeUid = safePathPart(uid)
  const safeStudentKey = safePathPart(studentKey)
  if (!safeClassId || !safeUid || !safeStudentKey) return null

  let database
  try {
    database = getDatabase(app, DATABASE_URL)
  } catch (error) {
    onError(error)
    return null
  }

  const classPresence = ref(database, `presence/${safeClassId}`)
  const ownPresence = ref(database, `presence/${safeClassId}/${safeUid}`)
  const connected = ref(database, '.info/connected')
  let stopped = false
  let connectedNow = false

  async function enter() {
    if (stopped || !connectedNow) return false
    try {
      const disconnect = onDisconnect(ownPresence)
      await disconnect.remove()
      await set(ownPresence, {
        studentKey: safeStudentKey,
        connectedAt: serverTimestamp(),
      })
      return true
    } catch (error) {
      onError(error)
      return false
    }
  }

  async function leave() {
    if (stopped) return false
    try {
      await remove(ownPresence)
      return true
    } catch (error) {
      onError(error)
      return false
    }
  }

  const stopClass = onValue(classPresence, (snapshot) => {
    let online = 0
    snapshot.forEach(() => { online += 1 })
    onOnlineCount(Number(online || 0))
  }, onError)

  const stopConnection = onValue(connected, (snapshot) => {
    connectedNow = snapshot.val() === true
    if (connectedNow && !document.hidden) void enter()
  }, onError)

  return {
    enter,
    leave,
    stop() {
      if (stopped) return
      void remove(ownPresence).catch(() => {})
      stopped = true
      stopClass()
      stopConnection()
    },
  }
}
