import { ensureSignedIn } from './school-sync.js'

const BOARD_READ_STATE_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/board-read-state'

function readStateError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function authHeaders() {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw readStateError('board-read/auth-required', '로그인 정보를 확인하지 못했어요.')
  return {
    authorization: `Bearer ${idToken}`,
    'content-type': 'application/json',
  }
}

function normalizeUnread(value) {
  const unread = {}
  for (const row of Array.isArray(value) ? value : []) {
    const postId = String(row?.postId || '').trim()
    const id = Math.max(0, Math.floor(Number(row?.id || 0)))
    if (!postId || !id) continue
    unread[postId] = {
      id,
      postId,
      sectionId: String(row?.sectionId || 'general').trim().slice(0, 32) || 'general',
      kind: String(row?.kind || 'post_updated').trim().slice(0, 24) || 'post_updated',
      at: Math.max(0, Number(row?.at || 0)),
    }
  }
  return unread
}

function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    initialized: source.initialized === true,
    cursor: Math.max(0, Math.floor(Number(source.cursor || 0))),
    seenCursor: Math.max(0, Math.floor(Number(source.seenCursor || 0))),
    unread: normalizeUnread(source.unread),
  }
}

async function requestBoardReadState(method = 'GET', payload = null) {
  let response
  try {
    response = await fetch(BOARD_READ_STATE_API_URL, {
      method,
      headers: await authHeaders(),
      body: payload ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw readStateError('board-read/network', '게시판 읽음 상태 서버에 연결하지 못했어요.')
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    throw readStateError(
      String(body?.error || `board-read/http-${response.status || 0}`),
      String(body?.message || '게시판 읽음 상태를 확인하지 못했어요.'),
    )
  }
  return normalizeState(body.state)
}

export async function loadPreviewBoardReadState() {
  return requestBoardReadState('GET')
}

export async function initializePreviewBoardReadState({ cursor = 0, seenCursor = 0, unread = [] } = {}) {
  return requestBoardReadState('POST', {
    action: 'initialize',
    cursor: Math.max(0, Math.floor(Number(cursor || 0))),
    seenCursor: Math.max(0, Math.floor(Number(seenCursor || 0))),
    unread: (Array.isArray(unread) ? unread : []).slice(0, 500),
  })
}

export async function markPreviewBoardSectionSeenShared(seenCursor) {
  return requestBoardReadState('POST', {
    action: 'mark-section-seen',
    seenCursor: Math.max(0, Math.floor(Number(seenCursor || 0))),
  })
}

export async function markPreviewBoardPostReadShared(postId, readCursor) {
  return requestBoardReadState('POST', {
    action: 'mark-post-read',
    postId: String(postId || '').trim(),
    readCursor: Math.max(0, Math.floor(Number(readCursor || 0))),
  })
}
