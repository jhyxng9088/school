import { ensureSignedIn } from './school-sync.js'

const UNREAD_STATE_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/unread-state'

function unreadStateError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function authHeaders() {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw unreadStateError('unread-state/auth-required', '로그인 정보를 확인하지 못했어요.')
  return {
    authorization: `Bearer ${idToken}`,
    'content-type': 'application/json',
  }
}

function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    boardInitialized: source.boardInitialized === true,
    boardSeenCursor: Math.max(0, Math.floor(Number(source.boardSeenCursor || 0))),
    studyInitialized: source.studyInitialized === true,
    studySeenAt: Math.max(0, Number(source.studySeenAt || 0)),
    studySeenCursor: Math.max(0, Math.floor(Number(source.studySeenCursor || 0))),
    updatedAt: Math.max(0, Number(source.updatedAt || 0)),
  }
}

async function requestUnreadState(method = 'GET', payload = null) {
  let response
  try {
    response = await fetch(UNREAD_STATE_API_URL, {
      method,
      headers: await authHeaders(),
      body: payload ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw unreadStateError('unread-state/network', '읽음 상태 서버에 연결하지 못했어요.')
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    throw unreadStateError(
      String(body?.error || `unread-state/http-${response.status || 0}`),
      String(body?.message || '읽음 상태를 확인하지 못했어요.'),
    )
  }
  return normalizeState(body.state)
}

export async function loadPreviewUnreadState() {
  return requestUnreadState('GET')
}

export async function advancePreviewUnreadState({
  boardInitialized = false,
  boardSeenCursor = 0,
  studyInitialized = false,
  studySeenAt = 0,
  studySeenCursor = 0,
} = {}) {
  return requestUnreadState('POST', {
    action: 'advance',
    boardInitialized: boardInitialized === true,
    boardSeenCursor: Math.max(0, Math.floor(Number(boardSeenCursor || 0))),
    studyInitialized: studyInitialized === true,
    studySeenAt: Math.max(0, Number(studySeenAt || 0)),
    studySeenCursor: Math.max(0, Math.floor(Number(studySeenCursor || 0))),
  })
}
