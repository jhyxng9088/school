import { ensureSignedIn } from './school-sync.js'

const BOARD_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board'
const BOARD_CACHE_FRESH_MS = 45_000
const ATTACHMENT_URL_SAFETY_MS = 30_000

export const BOARD_ATTACHMENT_LIMIT = 4
export const BOARD_ATTACHMENT_MAX_BYTES = 6 * 1024 * 1024
export const BOARD_ATTACHMENT_ACCEPT = 'image/*,.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.pages,.numbers,.key'

const ALLOWED_FILE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'zip', 'pages', 'numbers', 'key',
])

const sectionCache = new Map()
let cachedSections = []
let sectionsCachedAt = 0
const attachmentUrlCache = new Map()

function boardError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function authHeaders(contentType = 'application/json') {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw boardError('board/auth-required', '로그인 정보를 확인하지 못했어요.')
  const headers = { authorization: `Bearer ${idToken}` }
  if (contentType) headers['content-type'] = contentType
  return headers
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

async function requestBoard({ method = 'GET', payload = null, signal, sectionId = '', includeSections = true } = {}) {
  const headers = await authHeaders('application/json')
  const url = new URL(BOARD_API_URL)
  if (method === 'GET' && sectionId) url.searchParams.set('section', sectionId)
  if (method === 'GET' && !includeSections) url.searchParams.set('sections', '0')
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

function updateCachedPost(post) {
  if (!post?.id || !post?.sectionId) return
  const key = String(post.sectionId)
  const current = sectionCache.get(key)
  if (!current) return
  const index = current.posts.findIndex((item) => item.id === post.id)
  const posts = index < 0
    ? [post, ...current.posts]
    : current.posts.map((item, itemIndex) => (itemIndex === index ? post : item))
  sectionCache.set(key, { posts, loadedAt: Date.now() })
}

export function peekPreviewBoardCache(sectionId = 'general') {
  const key = String(sectionId || 'general')
  const cached = sectionCache.get(key)
  if (!cached) return null
  return {
    posts: [...cached.posts],
    sections: [...cachedSections],
    loadedAt: cached.loadedAt,
    isFresh: Date.now() - cached.loadedAt < BOARD_CACHE_FRESH_MS,
  }
}

export function previewBoardCacheIsFresh(sectionId = 'general') {
  return Boolean(peekPreviewBoardCache(sectionId)?.isFresh)
}

export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false } = {}) {
  const includeSections = forceSections || !cachedSections.length || Date.now() - sectionsCachedAt > 5 * 60_000
  const body = await requestBoard({ method: 'GET', signal, sectionId, includeSections })
  const posts = Array.isArray(body.posts) ? body.posts : []
  const sections = Array.isArray(body.sections) && body.sections.length ? body.sections : cachedSections
  if (Array.isArray(body.sections) && body.sections.length) {
    cachedSections = body.sections
    sectionsCachedAt = Date.now()
  }
  const activeSectionId = String(body.activeSectionId || sectionId || 'general')
  sectionCache.set(activeSectionId, { posts, loadedAt: Date.now() })
  return { posts, sections: [...sections], activeSectionId }
}

export function newPreviewBoardAttachmentDraftId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : ((random & 0x3) | 0x8)
    return value.toString(16)
  })
}

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''))
  return match ? match[1].toLowerCase() : ''
}

export function validatePreviewBoardAttachment(file) {
  if (!file) return '파일을 확인하지 못했어요.'
  if (!file.size) return '빈 파일은 올릴 수 없어요.'
  if (file.size > BOARD_ATTACHMENT_MAX_BYTES) return '파일은 하나당 6MB까지 올릴 수 있어요.'
  const extension = extensionOf(file.name)
  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) return '이 파일 형식은 게시판에 올릴 수 없어요.'
  if (String(file.type || '').toLowerCase() === 'image/svg+xml') return 'SVG 파일은 게시판에 올릴 수 없어요.'
  return ''
}

export async function uploadPreviewBoardAttachment(file, draftId) {
  const validation = validatePreviewBoardAttachment(file)
  if (validation) throw boardError('board/attachment-invalid', validation)
  const safeDraftId = String(draftId || '').trim()
  if (!safeDraftId) throw boardError('board/attachment-invalid', '첨부 파일 정보를 확인하지 못했어요.')

  const headers = await authHeaders(file.type || 'application/octet-stream')
  const url = new URL(BOARD_API_URL)
  url.searchParams.set('action', 'upload-attachment')
  url.searchParams.set('draft', safeDraftId)
  url.searchParams.set('name', String(file.name || 'file'))

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: file,
      cache: 'no-store',
    })
  } catch {
    throw boardError('board/network', '첨부 파일을 올리는 중 연결이 끊겼어요.')
  }
  const body = await parseBoardResponse(response)
  if (!body.attachment?.storagePath) throw boardError('board/attachment-invalid', '업로드된 파일을 확인하지 못했어요.')
  return body.attachment
}

export async function discardPreviewBoardAttachments(paths = []) {
  const cleanPaths = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))]
  if (!cleanPaths.length) return
  try {
    await requestBoard({
      method: 'POST',
      payload: { action: 'discard-attachments', paths: cleanPaths.slice(0, BOARD_ATTACHMENT_LIMIT) },
    })
  } catch (error) {
    console.warn('S-Hub board attachment cleanup skipped:', error)
  }
}

export async function createPreviewBoardPost({ sectionId = 'general', title, body, attachments = [] }) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'create', sectionId, title, body, attachments: attachments.slice(0, BOARD_ATTACHMENT_LIMIT) },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '새 게시글을 확인하지 못했어요.')
  updateCachedPost(response.post)
  return response.post
}

export async function createPreviewBoardSection(label, color) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'create-section', label, color },
  })
  if (!response.section?.id) throw boardError('board/invalid-section', '새 섹션을 확인하지 못했어요.')
  cachedSections = [...cachedSections.filter((item) => item.id !== response.section.id), response.section]
  sectionsCachedAt = Date.now()
  return response.section
}

export async function addPreviewBoardComment(postId, body) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'comment', postId, body },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '댓글이 반영된 게시글을 확인하지 못했어요.')
  updateCachedPost(response.post)
  return response.post
}

export async function resolvePreviewBoardQuestion(postId) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'resolve', postId },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '질문 상태를 확인하지 못했어요.')
  updateCachedPost(response.post)
  return response.post
}

export async function getPreviewBoardAttachmentUrls(postId, attachments = []) {
  const ids = attachments.map((item) => String(item?.id || '')).filter(Boolean).slice(0, BOARD_ATTACHMENT_LIMIT)
  const now = Date.now()
  const resolved = {}
  const missing = []
  for (const id of ids) {
    const cached = attachmentUrlCache.get(id)
    if (cached && cached.expiresAt - ATTACHMENT_URL_SAFETY_MS > now) resolved[id] = cached.url
    else missing.push(id)
  }
  if (!missing.length) return resolved

  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'attachment-urls', postId, attachmentIds: missing },
  })
  for (const item of Array.isArray(response.urls) ? response.urls : []) {
    const id = String(item?.attachmentId || '')
    const url = String(item?.url || '')
    const expiresAt = Number(item?.expiresAt || 0)
    if (!id || !url || !expiresAt) continue
    attachmentUrlCache.set(id, { url, expiresAt })
    resolved[id] = url
  }
  return resolved
}
