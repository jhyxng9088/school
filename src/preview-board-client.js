import { ensureSignedIn } from './school-sync.js'

const BOARD_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board'

function boardError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function authHeaders() {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw boardError('board/auth-required', '로그인 정보를 확인하지 못했어요.')
  return {
    authorization: `Bearer ${idToken}`,
    'content-type': 'application/json',
  }
}

async function parseBoardResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    throw boardError(
      String(body?.error || `board/http-${response.status || 0}`),
      String(body?.message || '게시판 요청을 처리하지 못했어요.'),
    )
  }
  return body
}

async function requestBoard({ method = 'GET', payload = null, signal, sectionId = '' } = {}) {
  const headers = await authHeaders()
  const url = new URL(BOARD_API_URL)
  if (method === 'GET' && sectionId) url.searchParams.set('section', sectionId)
  const options = {
    method,
    headers,
    cache: 'no-store',
    signal,
  }
  if (payload) options.body = JSON.stringify(payload)

  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw boardError('board/network', '게시판 서버에 연결하지 못했어요.')
  }
  return parseBoardResponse(response)
}

export async function loadPreviewBoard({ signal, sectionId = 'general' } = {}) {
  const body = await requestBoard({ method: 'GET', signal, sectionId })
  return {
    posts: Array.isArray(body.posts) ? body.posts : [],
    sections: Array.isArray(body.sections) ? body.sections : [],
    activeSectionId: String(body.activeSectionId || sectionId || 'general'),
  }
}

export async function createPreviewBoardPost({ sectionId = 'general', title, body }) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'create', sectionId, title, body },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '새 게시글을 확인하지 못했어요.')
  return response.post
}

export async function createPreviewBoardSection(label) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'create-section', label },
  })
  if (!response.section?.id) throw boardError('board/invalid-section', '새 섹션을 확인하지 못했어요.')
  return response.section
}

export async function addPreviewBoardComment(postId, body) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'comment', postId, body },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '댓글이 반영된 게시글을 확인하지 못했어요.')
  return response.post
}

export async function resolvePreviewBoardQuestion(postId) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'resolve', postId },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '질문 상태를 확인하지 못했어요.')
  return response.post
}
