import { ensureSignedIn } from './school-sync.js'

const PROJECT_REF = 'elhlsqhzjmsfhmawrpqu'
const PUBLISHABLE_KEY = 'sb_publishable_wzahH0kdX7gWmkrKvy9PDg_urg-7rs0'
const REALTIME_CONFIG_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/board-realtime`
const REALTIME_SOCKET_URL = `wss://${PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`
const REALTIME_BROADCAST_BASE = `https://${PROJECT_REF}.supabase.co/realtime/v1/api/broadcast`
const SCHOOL_STUDY_TOPIC = 'preview-study-school-v1'
const RECONNECT_MIN_MS = 1200
const RECONNECT_MAX_MS = 12_000
const HEARTBEAT_MS = 25_000

let topicPromise = null
let cachedTopic = ''
let nextRef = 1

async function firebaseAuthorization() {
  const user = await ensureSignedIn()
  const token = String(await user.getIdToken()).trim()
  if (!token) throw new Error('로그인 정보를 확인할 수 없습니다.')
  return `Bearer ${token}`
}

async function loadRealtimeTopic() {
  if (cachedTopic) return cachedTopic
  if (!topicPromise) {
    topicPromise = (async () => {
      const response = await fetch(REALTIME_CONFIG_URL, {
        method: 'GET',
        headers: { authorization: await firebaseAuthorization() },
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body?.ok !== true || !body?.topic) {
        throw new Error(String(body?.message || '스터디 실시간 연결을 준비하지 못했습니다.'))
      }
      cachedTopic = String(body.topic)
      return cachedTopic
    })().finally(() => {
      topicPromise = null
    })
  }
  return topicPromise
}

async function broadcastTopic(topic, kind) {
  const response = await fetch(`${REALTIME_BROADCAST_BASE}/${encodeURIComponent(topic)}/events/study_changed`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ at: Date.now(), kind: String(kind || 'study').slice(0, 20) }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`realtime broadcast ${response.status}`)
}

export async function broadcastPreviewStudyRealtime(kind = 'study') {
  try {
    const classTopic = await loadRealtimeTopic()
    const results = await Promise.allSettled([
      broadcastTopic(classTopic, kind),
      broadcastTopic(SCHOOL_STUDY_TOPIC, kind),
    ])
    return results.some((result) => result.status === 'fulfilled')
  } catch (error) {
    console.warn('S-Hub study realtime broadcast skipped:', error)
    return false
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

function stopSocketState(state) {
  if (!state || state.stopped) return
  state.stopped = true
  if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer)
  if (state.heartbeatTimer) window.clearInterval(state.heartbeatTimer)
  state.reconnectTimer = 0
  state.heartbeatTimer = 0
  const socket = state.socket
  if (socket && socket.readyState === WebSocket.OPEN) {
    const ref = nextRef++
    sendSocket(socket, makeMessage(`realtime:${state.topic}`, 'phx_leave', {}, ref, state.joinRef || ref))
  }
  try { socket?.close(1000, 'study-unsubscribe') } catch { /* no-op */ }
}

function scheduleReconnect(state) {
  if (state.stopped || state.reconnectTimer) return
  const attempt = Math.min(6, state.reconnectAttempt++)
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * (2 ** attempt))
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = 0
    if (!state.stopped && navigator.onLine !== false) connectSocket(state)
    else if (!state.stopped) scheduleReconnect(state)
  }, delay)
}

function connectSocket(state) {
  if (state.stopped || typeof WebSocket === 'undefined') return
  let socket
  try {
    socket = new WebSocket(REALTIME_SOCKET_URL)
  } catch {
    scheduleReconnect(state)
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
  })

  socket.addEventListener('message', (event) => {
    if (state.stopped || state.socket !== socket || typeof event.data !== 'string') return
    let message
    try { message = JSON.parse(event.data) } catch { return }
    if (message?.topic !== `realtime:${state.topic}` || message?.event !== 'broadcast') return
    const broadcast = message?.payload || {}
    if (broadcast?.event !== 'study_changed') return
    state.onChange(broadcast?.payload && typeof broadcast.payload === 'object' ? broadcast.payload : {})
  })

  socket.addEventListener('close', () => {
    if (state.socket === socket) state.socket = null
    if (state.heartbeatTimer) window.clearInterval(state.heartbeatTimer)
    state.heartbeatTimer = 0
    if (!state.stopped) scheduleReconnect(state)
  })

  socket.addEventListener('error', () => {
    try { socket.close() } catch { /* close listener handles reconnect */ }
  })
}

function startSubscription(topic, onChange) {
  const state = {
    topic,
    onChange,
    socket: null,
    joinRef: 0,
    heartbeatTimer: 0,
    reconnectTimer: 0,
    reconnectAttempt: 0,
    stopped: false,
  }
  connectSocket(state)
  return state
}

export async function subscribePreviewStudyRealtime(onClassChange, onSchoolChange = () => {}) {
  if (typeof onClassChange !== 'function' || typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}
  const classTopic = await loadRealtimeTopic()
  // Each caller owns its own sockets. The Study page and the global unread
  // controller therefore coexist instead of replacing one another.
  const localStates = [
    startSubscription(classTopic, onClassChange),
    startSubscription(SCHOOL_STUDY_TOPIC, typeof onSchoolChange === 'function' ? onSchoolChange : () => {}),
  ]
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    localStates.forEach(stopSocketState)
  }
}
