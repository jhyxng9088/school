import { ensureSignedIn } from './school-sync.js'

const BOARD_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board'
const BOARD_CACHE_FRESH_MS = 45_000
const ATTACHMENT_URL_SAFETY_MS = 30_000
const BOARD_GET_RETRY_DELAYS = [0, 180, 420]

export const BOARD_PAGE_SIZE = 40
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

async function requestBoard({ method = 'GET', payload = null, signal, sectionId = '', includeSections = true, cursor = '' } = {}) {
  const headers = await authHeaders('application/json')
  const url = new URL(BOARD_API_URL)
  if (method === 'GET' && sectionId) url.searchParams.set('section', sectionId)
  if (method === 'GET' && !includeSections) url.searchParams.set('sections', '0')
  if (method === 'GET' && cursor) url.searchParams.set('cursor', cursor)
  const options = {
    method,
    headers,
    cache: 'no-store',
    signal,
  }
  if (payload) options.body = JSON.stringify(payload)

  const delays = method === 'GET' ? BOARD_GET_RETRY_DELAYS : [0]
  let response = null
  let lastNetworkError = null
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, delays[attempt]))
    if (signal?.aborted) {
      const aborted = new Error('Aborted')
      aborted.name = 'AbortError'
      throw aborted
    }
    try {
      response = await fetch(url, options)
      lastNetworkError = null
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      lastNetworkError = error
      if (attempt === delays.length - 1) throw boardError('board/network', '게시판 서버에 연결하지 못했어요.')
      continue
    }
    const retryable = method === 'GET' && response.status >= 500 && attempt < delays.length - 1
    if (!retryable) return parseBoardResponse(response)
  }
  if (lastNetworkError) throw boardError('board/network', '게시판 서버에 연결하지 못했어요.')
  return parseBoardResponse(response)
}

function uniquePosts(posts = []) {
  const seen = new Set()
  return posts.filter((post) => {
    const id = String(post?.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function removeCachedPost(postId) {
  const id = String(postId || '')
  if (!id) return
  for (const [key, current] of sectionCache.entries()) {
    const posts = current.posts.filter((post) => post.id !== id)
    if (posts.length !== current.posts.length) sectionCache.set(key, { ...current, posts })
  }
}

function updateCachedPost(post) {
  if (!post?.id || !post?.sectionId) return
  removeCachedPost(post.id)
  const key = String(post.sectionId)
  const current = sectionCache.get(key)
  if (!current) {
    sectionCache.set(key, {
      posts: [post],
      loadedAt: Date.now(),
      hasMore: false,
      nextCursor: '',
    })
    return
  }
  sectionCache.set(key, {
    ...current,
    posts: uniquePosts([post, ...current.posts]),
    loadedAt: Date.now(),
  })
}

function updateCachedSection(section) {
  if (!section?.id) return
  const index = cachedSections.findIndex((item) => item.id === section.id)
  cachedSections = index < 0
    ? [...cachedSections, section]
    : cachedSections.map((item, itemIndex) => (itemIndex === index ? section : item))
  sectionsCachedAt = Date.now()
}

export function invalidatePreviewBoardSection(sectionId = '') {
  if (sectionId) sectionCache.delete(String(sectionId))
  else sectionCache.clear()
}

export function peekPreviewBoardCache(sectionId = 'general') {
  const key = String(sectionId || 'general')
  const cached = sectionCache.get(key)
  if (!cached) return null
  return {
    posts: [...cached.posts],
    sections: [...cachedSections],
    loadedAt: cached.loadedAt,
    hasMore: Boolean(cached.hasMore),
    nextCursor: String(cached.nextCursor || ''),
    isFresh: Date.now() - cached.loadedAt < BOARD_CACHE_FRESH_MS,
  }
}

export function previewBoardCacheIsFresh(sectionId = 'general') {
  return Boolean(peekPreviewBoardCache(sectionId)?.isFresh)
}

export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {
  const includeSections = !cursor && (forceSections || !cachedSections.length || Date.now() - sectionsCachedAt > 5 * 60_000)
  const body = await requestBoard({ method: 'GET', signal, sectionId, includeSections, cursor })
  const pagePosts = Array.isArray(body.posts) ? body.posts : []
  const sections = Array.isArray(body.sections) && body.sections.length ? body.sections : cachedSections
  if (Array.isArray(body.sections) && body.sections.length) {
    cachedSections = body.sections
    sectionsCachedAt = Date.now()
  }
  const activeSectionId = String(body.activeSectionId || sectionId || 'general')
  const prior = sectionCache.get(activeSectionId)
  const posts = append && prior ? uniquePosts([...prior.posts, ...pagePosts]) : uniquePosts(pagePosts)
  const page = body.page && typeof body.page === 'object' ? body.page : {}
  const hasMore = Boolean(page.hasMore)
  const nextCursor = String(page.nextCursor || '')
  sectionCache.set(activeSectionId, { posts, loadedAt: Date.now(), hasMore, nextCursor })
  return { posts, sections: [...sections], activeSectionId, hasMore, nextCursor }
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

export async function editPreviewBoardPost({ postId, sectionId, title, body, keepAttachmentIds = [], attachments = [] }) {
  const response = await requestBoard({
    method: 'POST',
    payload: {
      action: 'edit-post',
      postId,
      sectionId,
      title,
      body,
      keepAttachmentIds: keepAttachmentIds.slice(0, BOARD_ATTACHMENT_LIMIT),
      attachments: attachments.slice(0, BOARD_ATTACHMENT_LIMIT),
    },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '수정된 게시글을 확인하지 못했어요.')
  updateCachedPost(response.post)
  return response.post
}

export async function deletePreviewBoardPost(postId) {
  const response = await requestBoard({ method: 'POST', payload: { action: 'delete-post', postId } })
  if (!response.postId) throw boardError('board/invalid-post', '삭제된 게시글을 확인하지 못했어요.')
  removeCachedPost(response.postId)
  return { postId: String(response.postId), sectionId: String(response.sectionId || 'general') }
}

export async function createPreviewBoardSection(label, color) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'create-section', label, color },
  })
  if (!response.section?.id) throw boardError('board/invalid-section', '새 섹션을 확인하지 못했어요.')
  updateCachedSection(response.section)
  return response.section
}

export async function editPreviewBoardSection(sectionId, label, color) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'edit-section', sectionId, label, color },
  })
  if (!response.section?.id) throw boardError('board/invalid-section', '수정된 섹션을 확인하지 못했어요.')
  updateCachedSection(response.section)
  return response.section
}

export async function deletePreviewBoardSection(sectionId) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'delete-section', sectionId },
  })
  if (!response.sectionId) throw boardError('board/invalid-section', '삭제된 섹션을 확인하지 못했어요.')
  cachedSections = cachedSections.filter((item) => item.id !== response.sectionId)
  sectionsCachedAt = Date.now()
  sectionCache.delete(String(response.sectionId))
  sectionCache.delete('general')
  return { sectionId: String(response.sectionId), movedCount: Number(response.movedCount || 0) }
}

export async function addPreviewBoardComment(postId, body, attachments = []) {
  const response = await requestBoard({
    method: 'POST',
    payload: {
      action: 'comment',
      postId,
      body,
      attachments: attachments.slice(0, BOARD_ATTACHMENT_LIMIT),
    },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '댓글이 반영된 게시글을 확인하지 못했어요.')
  updateCachedPost(response.post)
  return response.post
}

export async function editPreviewBoardComment(
  postId,
  commentId,
  body,
  { keepAttachmentIds = [], attachments = [] } = {},
) {
  const response = await requestBoard({
    method: 'POST',
    payload: {
      action: 'edit-comment',
      postId,
      commentId,
      body,
      keepAttachmentIds: keepAttachmentIds.slice(0, BOARD_ATTACHMENT_LIMIT),
      attachments: attachments.slice(0, BOARD_ATTACHMENT_LIMIT),
    },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '수정된 댓글을 확인하지 못했어요.')
  updateCachedPost(response.post)
  return response.post
}

export async function deletePreviewBoardComment(postId, commentId) {
  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'delete-comment', postId, commentId },
  })
  if (!response.post?.id) throw boardError('board/invalid-post', '댓글 삭제 결과를 확인하지 못했어요.')
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

async function getPreviewBoardAttachmentAccess(postId, attachmentId) {
  const id = String(attachmentId || '').trim()
  if (!id) throw boardError('board/attachment-required', '첨부 파일을 찾지 못했어요.')
  const cached = attachmentUrlCache.get(id)
  if (cached && cached.expiresAt - ATTACHMENT_URL_SAFETY_MS > Date.now()) return cached

  const response = await requestBoard({
    method: 'POST',
    payload: { action: 'attachment-url', postId, attachmentId: id },
  })
  const url = String(response.url || '')
  const expiresAt = Number(response.expiresAt || 0)
  if (!url || !expiresAt) throw boardError('board/attachment-url', '원본 파일을 열지 못했어요.')
  const access = { url, expiresAt, attachment: response.attachment || null }
  attachmentUrlCache.set(id, access)
  return access
}

export async function getPreviewBoardAttachmentUrl(postId, attachmentId) {
  return (await getPreviewBoardAttachmentAccess(postId, attachmentId)).url
}

export async function loadPreviewBoardAttachmentOriginal(postId, attachmentId) {
  const access = await getPreviewBoardAttachmentAccess(postId, attachmentId)
  let response
  try {
    response = await fetch(access.url, { method: 'GET', cache: 'no-store' })
  } catch {
    throw boardError('board/attachment-network', '원본 파일을 불러오는 중 연결이 끊겼어요.')
  }
  if (!response.ok) {
    attachmentUrlCache.delete(String(attachmentId || ''))
    throw boardError('board/attachment-download', '원본 파일을 불러오지 못했어요.')
  }
  const blob = await response.blob()
  const attachment = access.attachment || {}
  return {
    blob,
    name: String(attachment.fileName || '원본 파일'),
    mimeType: String(attachment.mimeType || blob.type || 'application/octet-stream'),
    size: Number(attachment.sizeBytes || blob.size || 0),
  }
}
