import { classKeyFor, ensureSignedIn, readStudentProfile } from './school-sync.js'

const PROJECT_REF = 'elhlsqhzjmsfhmawrpqu'
const PUBLISHABLE_KEY = 'sb_publishable_wzahH0kdX7gWmkrKvy9PDg_urg-7rs0'
const API_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/class-activity-mirror`
const SOCKET_URL = `wss://${PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`
const BROADCAST_BASE = `https://${PROJECT_REF}.supabase.co/realtime/v1/api/broadcast`
const RECONNECT_MIN_MS = 1200
const RECONNECT_MAX_MS = 12_000
const HEARTBEAT_MS = 25_000

let nextRef = 1
const topicByClass = new Map()

function cleanActivity(value) {
  const entityType = String(value?.entityType || '').trim().slice(0, 30)
  const entityId = String(value?.entityId || '').trim().slice(0, 120)
  const actorName = String(value?.actorName || '').trim().slice(0, 20)
  const actorStudentKey = String(value?.actorStudentKey || '').trim().slice(0, 120)
  const updatedAt = Math.max(0, Number(value?.updatedAt || 0))
  if (!entityType || !entityId || !actorName || !updatedAt) return null
  return {
    entityType,
    entityId,
    actorName,
    actorStudentKey,
    action: value?.action === 'added' ? 'added' : 'edited',
    updatedAt,
  }
}

async function authorization() {
  const user = await ensureSignedIn()
  const token = String(await user.getIdToken()).trim()
  if (!token) throw new Error('로그인 정보를 확인하지 못했어요.')
  return `Bearer ${token}`
}

export async function loadSupabaseClassActivity(profile = readStudentProfile()) {
  const classId = classKeyFor(profile)
  if (!classId) throw new Error('반 정보를 확인하지 못했어요.')
  const url = new URL(API_URL)
  url.searchParams.set('classId', classId)
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: await authorization() },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true || !body?.topic) {
    throw new Error(String(body?.message || '활동 정보를 불러오지 못했어요.'))
  }
  const topic = String(body.topic)
  topicByClass.set(classId, topic)
  return {
    topic,
    activity: (Array.isArray(body.activity) ? body.activity : []).map(cleanActivity).filter(Boolean),
  }
}

function cleanWriteEntry(value) {
  const entityType = String(value?.entityType || '').trim().slice(0, 30)
  const entityId = String(value?.entityId || '').trim().slice(0, 120)
  const updatedAt = Math.max(0, Number(value?.updatedAt || 0))
  if (!entityType || !entityId || !updatedAt) return null
  return {
    entityType,
    entityId,
    action: value?.action === 'added' ? 'added' : 'edited',
    updatedAt,
    actorName: String(value?.actorName || '').trim().slice(0, 20),
    actorStudentKey: String(value?.actorStudentKey || '').trim().slice(0, 120),
  }
}

async function broadcastFallback(classId, entries) {
  const topic = topicByClass.get(classId)
  if (!topic || !entries.length) return false
  try {
    const response = await fetch(`${BROADCAST_BASE}/${encodeURIComponent(topic)}/events/activity_changed`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ at: Date.now(), entries }),
      cache: 'no-store',
      keepalive: true,
    })
    return response.ok
  } catch {
    return false
  }
}

export async function saveSupabaseClassActivities(profile, entries = []) {
  const classId = classKeyFor(profile)
  const cleanEntries = entries.map(cleanWriteEntry).filter(Boolean)
  if (!classId || !cleanEntries.length) return { ok: false, mirrored: false, realtime: false }
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        authorization: await authorization(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ classId, entries: cleanEntries }),
      cache: 'no-store',
      keepalive: true,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.ok !== true) throw new Error(String(body?.message || '활동 미러를 저장하지 못했어요.'))
    if (body?.topic) topicByClass.set(classId, String(body.topic))
    return {
      ok: true,
      mirrored: body.mirrored === true,
      realtime: body.realtime === true,
    }
  } catch (error) {
    const realtime = await broadcastFallback(classId, cleanEntries)
    console.warn('Supabase class activity mirror unavailable; Firestore write remains canonical.', error)
    return { ok: false, mirrored: false, realtime }
  }
}

function sendSocket(socket, message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

function makeMessage(topic, event, payload, ref, joinRef = null) {
  return {
    topic,
    event,
    payload,
    ref: String(ref),
    join_ref: joinRef == null ? null : String(joinRef),
  }
}

export function subscribeSupabaseClassActivity(topic, {
  onEntries = () => {},
  onAvailable = () => {},
  onUnavailable = () => {},
} = {}) {
  if (!topic || typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    onUnavailable()
    return () => {}
  }

  const state = {
    topic,
    socket: null,
    joinRef: 0,
    reconnectTimer: 0,
    heartbeatTimer: 0,
    reconnectAttempt: 0,
    stopped: false,
    unavailable: false,
  }

  const markUnavailable = () => {
    if (state.unavailable) return
    state.unavailable = true
    try { onUnavailable() } catch {}
  }
  const markAvailable = () => {
    state.unavailable = false
    try { onAvailable() } catch {}
  }

  const scheduleReconnect = () => {
    if (state.stopped || state.reconnectTimer) return
    markUnavailable()
    const attempt = Math.min(6, state.reconnectAttempt++)
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * (2 ** attempt))
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = 0
      if (!state.stopped && navigator.onLine !== false) connect()
      else if (!state.stopped) scheduleReconnect()
    }, delay)
  }

  const connect = () => {
    if (state.stopped) return
    let socket
    try {
      socket = new WebSocket(SOCKET_URL)
    } catch {
      scheduleReconnect()
      return
    }
    state.socket = socket

    socket.addEventListener('open', () => {
      if (state.stopped || state.socket !== socket) return
      state.reconnectAttempt = 0
      const joinRef = nextRef++
      state.joinRef = joinRef
      sendSocket(socket, makeMessage(
        `realtime:${state.topic}`,
        'phx_join',
        {
          config: {
            broadcast: { ack: false, self: false },
            presence: { enabled: false },
            postgres_changes: [],
            private: false,
          },
        },
        joinRef,
        joinRef,
      ))
      if (state.heartbeatTimer) window.clearInterval(state.heartbeatTimer)
      state.heartbeatTimer = window.setInterval(() => {
        sendSocket(socket, makeMessage('phoenix', 'heartbeat', {}, nextRef++))
      }, HEARTBEAT_MS)
      markAvailable()
    })

    socket.addEventListener('message', (event) => {
      if (state.stopped || state.socket !== socket || typeof event.data !== 'string') return
      let message
      try { message = JSON.parse(event.data) } catch { return }
      if (message?.topic !== `realtime:${state.topic}` || message?.event !== 'broadcast') return
      const broadcast = message?.payload || {}
      if (broadcast?.event !== 'activity_changed') return
      const entries = (Array.isArray(broadcast?.payload?.entries) ? broadcast.payload.entries : [])
        .map(cleanActivity)
        .filter(Boolean)
      if (entries.length) onEntries(entries)
    })

    socket.addEventListener('close', () => {
      if (state.socket === socket) state.socket = null
      if (state.heartbeatTimer) window.clearInterval(state.heartbeatTimer)
      state.heartbeatTimer = 0
      if (!state.stopped) scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      try { socket.close() } catch {}
    })
  }

  connect()

  return () => {
    if (state.stopped) return
    state.stopped = true
    if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer)
    if (state.heartbeatTimer) window.clearInterval(state.heartbeatTimer)
    try { state.socket?.close(1000, 'activity-unsubscribe') } catch {}
  }
}
