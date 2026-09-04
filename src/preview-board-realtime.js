import { ensureSignedIn } from './school-sync.js'
import { dispatchPreviewBoardPostPush } from './preview-social-push.js'

const PROJECT_REF = 'elhlsqhzjmsfhmawrpqu'
const PUBLISHABLE_KEY = 'sb_publishable_wzahH0kdX7gWmkrKvy9PDg_urg-7rs0'
const REALTIME_CONFIG_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/board-realtime`
const REALTIME_SOCKET_URL = `wss://${PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`
const REALTIME_BROADCAST_BASE = `https://${PROJECT_REF}.supabase.co/realtime/v1/api/broadcast`
const RECONNECT_MIN_MS = 1200
const RECONNECT_MAX_MS = 12_000
const HEARTBEAT_MS = 25_000

let topicPromise = null
let cachedTopic = ''
let socketState = null
let nextRef = 1
const listeners = new Set()

async function firebaseAuthorization() {
  const user = await ensureSignedIn()
  const token = String(await user.getIdToken()).trim()
  if (!token) throw new Error('로그인 정보를 확인하지 못했어요.')
  return `Bearer ${token}`
}

function normalizeReadState(value) {
  const unread = (Array.isArray(value?.unread) ? value.unread : [])
    .map((entry) => ({
      id: Math.max(0, Number(entry?.id || 0)),
      postId: String(entry?.postId || '').trim().slice(0, 80),
      sectionId: String(entry?.sectionId || 'general').trim().slice(0, 32) || 'general',
      kind: String(entry?.kind || 'post_updated').trim().slice(0, 24),
      at: Math.max(0, Number(entry?.at || 0)),
    }))
    .filter((entry) => entry.id > 0 && entry.postId)
  return {
    initialized: value?.initialized === true,
    cursor: Math.max(0, Number(value?.cursor || 0)),
    seenCursor: Math.max(0, Number(value?.seenCursor || 0)),
    unread,
  }
}

async function requestRealtimeConfig(since = null) {
  const url = new URL(REALTIME_CONFIG_URL)
  if (since != null) url.searchParams.set('since', String(Math.max(0, Number(since) || 0)))
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: await firebaseAuthorization() },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true || !body?.topic) {
    throw new Error(String(body?.message || '게시판 실시간 연결을 준비하지 못했어요.'))
  }
  cachedTopic = String(body.topic)
  return {
    topic: cachedTopic,
    cursor: Math.max(0, Number(body.cursor || 0)),
    events: Array.isArray(body.events) ? body.events : [],
    hasMore: Boolean(body.hasMore),
    readState: body?.readState ? normalizeReadState(body.readState) : null,
  }
}

async function requestReadStateMutation(payload) {
  const response = await fetch(REALTIME_CONFIG_URL, {
    method: 'POST',
    headers: {
      authorization: await firebaseAuthorization(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true || !body?.readState) {
    throw new Error(String(body?.message || '게시판 읽음 상태를 저장하지 못했어요.'))
  }
  return normalizeReadState(body.readState)
}

async function loadRealtimeTopic() {
  if (cachedTopic) return cachedTopic
  if (!topicPromise) {
    topicPromise = requestRealtimeConfig(null)
      .then((config) => config.topic)
      .finally(() => {
        topicPromise = null
      })
  }
  return topicPromise
}

export async function loadPreviewBoardEvents(since = null) {
  return requestRealtimeConfig(since)
}

export async function savePreviewBoardPostRead(postId, readCursor) {
  const cleanPostId = String(postId || '').trim()
  const cleanCursor = Math.max(0, Math.floor(Number(readCursor || 0)))
  if (!cleanPostId || !cleanCursor) return null
  return requestReadStateMutation({ action: 'mark-post-read', postId: cleanPostId, readCursor: cleanCursor })
}

export async function savePreviewBoardSectionSeen(cursor) {
  const cleanCursor = Math.max(0, Math.floor(Number(cursor || 0)))
  return requestReadStateMutation({ action: 'mark-section-seen', cursor: cleanCursor })
}

function safePayload(value) {
  const source = value && typeof value === 'object' ? value : {}
  const rawSections = Array.isArray(source.sectionIds) ? source.sectionIds : [source.sectionId]
  const sectionIds = [...new Set(rawSections
    .map((item) => String(item || '').trim().slice(0, 32))
    .filter(Boolean))]
    .slice(0, 2)
  return {
    at: Date.now(),
    kind: String(source.kind || 'board').slice(0, 20),
    sectionIds,
  }
}

export async function broadcastPreviewBoardRealtime(payload = {}) {
  const safe = safePayload(payload)
  // announceMutation is called only after the board API confirms the write. Push
  // is independent of Supabase Broadcast availability, and the Vercel endpoint
  // re-verifies the newest authored post before sending anything.
  if (safe.kind === 'post' && safe.sectionIds[0]) {
    void dispatchPreviewBoardPostPush({ sectionId: safe.sectionIds[0] })
  }

  try {
    const topic = await loadRealtimeTopic()
    const response = await fetch(`${REALTIME_BROADCAST_BASE}/${encodeURIComponent(topic)}/events/board_changed`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(safe),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`realtime broadcast ${response.status}`)
    return true
  } catch (error) {
    console.warn('S-Hub board realtime broadcast skipped:', error)
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
  try { socket?.close(1000, 'board-unsubscribe') } catch { /* no-op */ }
  if (socketState === state) socketState = null
}

function emitRealtimeChange(payload) {
  for (const listener of [...listeners]) {
    try { listener(payload) } catch (error) { console.error('S-Hub board realtime listener failed:', error) }
  }
}

function connectSocket(state) {
  if (state.stopped || typeof WebSocket === 'undefined') return
  let socket
  try {
    socket = new WebSocket(REALTIME_SOCKET_URL)
  } catch (error) {
    scheduleReconnect(state, error)
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
    if (broadcast?.event !== 'board_changed') return
    emitRealtimeChange(broadcast?.payload && typeof broadcast.payload === 'object' ? broadcast.payload : {})
  })

  socket.addEventListener('close', () => {
    if (state.socket === socket) state.socket = null
    if (state.heartbeatTimer) window.clearInterval(state.heartbeatTimer)
    state.heartbeatTimer = 0
    if (!state.stopped && listeners.size) scheduleReconnect(state)
  })

  socket.addEventListener('error', () => {
    try { socket.close() } catch { /* close listener handles reconnect */ }
  })
}

function scheduleReconnect(state) {
  if (state.stopped || state.reconnectTimer || !listeners.size) return
  const attempt = Math.min(6, state.reconnectAttempt++)
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * (2 ** attempt))
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = 0
    if (!state.stopped && listeners.size && navigator.onLine !== false) connectSocket(state)
    else if (!state.stopped && listeners.size) scheduleReconnect(state)
  }, delay)
}

async function ensureSocket() {
  if (socketState && !socketState.stopped) return socketState
  const topic = await loadRealtimeTopic()
  if (!listeners.size) return null
  const state = {
    topic,
    socket: null,
    joinRef: 0,
    heartbeatTimer: 0,
    reconnectTimer: 0,
    reconnectAttempt: 0,
    stopped: false,
  }
  socketState = state
  connectSocket(state)
  return state
}

export async function subscribePreviewBoardRealtime(onChange) {
  if (typeof onChange !== 'function' || typeof window === 'undefined' || typeof WebSocket === 'undefined') return () => {}
  listeners.add(onChange)
  try {
    await ensureSocket()
  } catch (error) {
    listeners.delete(onChange)
    throw error
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    listeners.delete(onChange)
    if (!listeners.size && socketState) stopSocketState(socketState)
  }
}
