function replaceOnce(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview fast cache marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchBoardClient(source) {
  let next = replaceOnce(
    source,
    "import { ensureSignedIn } from './school-sync.js'",
    "import { ensureSignedIn } from './school-sync.js'\nimport { previewFastCacheScopeKey, readPreviewPersistentCache, writePreviewPersistentCache } from './preview-fast-cache.js'",
    'board cache import',
  )

  const cacheMarker = 'const attachmentUrlCache = new Map()'
  const cacheHelpers = `${cacheMarker}\nlet hydratedBoardScopeKey = null\n\nfunction persistBoardCache() {\n  const entries = [...sectionCache.entries()]\n    .sort((a, b) => Number(b[1]?.loadedAt || 0) - Number(a[1]?.loadedAt || 0))\n    .slice(0, 8)\n    .map(([sectionId, value]) => ({\n      sectionId,\n      posts: Array.isArray(value?.posts) ? value.posts.slice(0, BOARD_PAGE_SIZE) : [],\n      loadedAt: Math.max(0, Number(value?.loadedAt || 0)),\n      hasMore: Boolean(value?.hasMore),\n      nextCursor: String(value?.nextCursor || ''),\n    }))\n  writePreviewPersistentCache('board', 'sections', {\n    sections: cachedSections.slice(0, 24),\n    sectionsCachedAt,\n    entries,\n  })\n}\n\nfunction hydrateBoardCache() {\n  const scopeKey = previewFastCacheScopeKey()\n  if (hydratedBoardScopeKey === scopeKey) return\n  hydratedBoardScopeKey = scopeKey\n  sectionCache.clear()\n  cachedSections = []\n  sectionsCachedAt = 0\n  if (!scopeKey) return\n  const stored = readPreviewPersistentCache('board', 'sections')\n  if (!stored || typeof stored !== 'object') return\n  cachedSections = Array.isArray(stored.sections) ? stored.sections.slice(0, 24) : []\n  sectionsCachedAt = Math.max(0, Number(stored.sectionsCachedAt || 0))\n  for (const entry of Array.isArray(stored.entries) ? stored.entries.slice(0, 8) : []) {\n    const sectionId = String(entry?.sectionId || '')\n    if (!sectionId) continue\n    sectionCache.set(sectionId, {\n      posts: Array.isArray(entry.posts) ? entry.posts.slice(0, BOARD_PAGE_SIZE) : [],\n      loadedAt: Math.max(0, Number(entry.loadedAt || 0)),\n      hasMore: Boolean(entry.hasMore),\n      nextCursor: String(entry.nextCursor || ''),\n      fromPersistent: true,\n    })\n  }\n}\n`
  next = replaceOnce(next, cacheMarker, cacheHelpers, 'board persistent helpers')

  next = replaceOnce(
    next,
    `function removeCachedPost(postId) {\n  const id = String(postId || '')`,
    `function removeCachedPost(postId) {\n  hydrateBoardCache()\n  const id = String(postId || '')`,
    'board remove hydrate',
  )
  next = replaceOnce(
    next,
    `  for (const [key, current] of sectionCache.entries()) {\n    const posts = current.posts.filter((post) => post.id !== id)\n    if (posts.length !== current.posts.length) sectionCache.set(key, { ...current, posts })\n  }\n}`,
    `  for (const [key, current] of sectionCache.entries()) {\n    const posts = current.posts.filter((post) => post.id !== id)\n    if (posts.length !== current.posts.length) sectionCache.set(key, { ...current, posts, fromPersistent: false })\n  }\n  persistBoardCache()\n}`,
    'board remove persist',
  )

  next = replaceOnce(
    next,
    `function updateCachedPost(post) {\n  if (!post?.id || !post?.sectionId) return`,
    `function updateCachedPost(post) {\n  hydrateBoardCache()\n  if (!post?.id || !post?.sectionId) return`,
    'board post hydrate',
  )
  next = replaceOnce(
    next,
    `      nextCursor: '',\n    })\n    return`,
    `      nextCursor: '',\n      fromPersistent: false,\n    })\n    persistBoardCache()\n    return`,
    'board new post persist',
  )
  next = replaceOnce(
    next,
    `    loadedAt: Date.now(),\n  })\n}\n\nfunction updateCachedSection`,
    `    loadedAt: Date.now(),\n    fromPersistent: false,\n  })\n  persistBoardCache()\n}\n\nfunction updateCachedSection`,
    'board existing post persist',
  )
  next = replaceOnce(
    next,
    `function updateCachedSection(section) {\n  if (!section?.id) return`,
    `function updateCachedSection(section) {\n  hydrateBoardCache()\n  if (!section?.id) return`,
    'board section hydrate',
  )
  next = replaceOnce(
    next,
    `  sectionsCachedAt = Date.now()\n}\n\nexport function invalidatePreviewBoardSection`,
    `  sectionsCachedAt = Date.now()\n  persistBoardCache()\n}\n\nexport function invalidatePreviewBoardSection`,
    'board section persist',
  )

  const invalidateMarker = `export function invalidatePreviewBoardSection(sectionId = '') {\n  if (sectionId) sectionCache.delete(String(sectionId))\n  else sectionCache.clear()\n}`
  const invalidateReplacement = `export function invalidatePreviewBoardSection(sectionId = '') {\n  hydrateBoardCache()\n  if (sectionId) sectionCache.delete(String(sectionId))\n  else sectionCache.clear()\n  persistBoardCache()\n}`
  next = replaceOnce(next, invalidateMarker, invalidateReplacement, 'board invalidate persist')

  const peekMarker = `export function peekPreviewBoardCache(sectionId = 'general') {\n  const key = String(sectionId || 'general')\n  const cached = sectionCache.get(key)\n  if (!cached) return null\n  return {\n    posts: [...cached.posts],\n    sections: [...cachedSections],\n    loadedAt: cached.loadedAt,\n    hasMore: Boolean(cached.hasMore),\n    nextCursor: String(cached.nextCursor || ''),\n    isFresh: Date.now() - cached.loadedAt < BOARD_CACHE_FRESH_MS,\n  }\n}`
  const peekReplacement = `export function peekPreviewBoardCache(sectionId = 'general') {\n  hydrateBoardCache()\n  const key = String(sectionId || 'general')\n  const cached = sectionCache.get(key)\n  if (!cached) {\n    return {\n      posts: [],\n      sections: [...cachedSections],\n      loadedAt: 0,\n      hasMore: false,\n      nextCursor: '',\n      isFresh: false,\n      needsRevalidate: true,\n      isPlaceholder: true,\n    }\n  }\n  const isFresh = Date.now() - cached.loadedAt < BOARD_CACHE_FRESH_MS\n  return {\n    posts: [...cached.posts],\n    sections: [...cachedSections],\n    loadedAt: cached.loadedAt,\n    hasMore: Boolean(cached.hasMore),\n    nextCursor: String(cached.nextCursor || ''),\n    isFresh,\n    needsRevalidate: Boolean(cached.fromPersistent) || !isFresh,\n    isPlaceholder: false,\n  }\n}`
  next = replaceOnce(next, peekMarker, peekReplacement, 'board cache peek')

  next = replaceOnce(
    next,
    `export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {\n  const includeSections`,
    `export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {\n  hydrateBoardCache()\n  const includeSections`,
    'board load hydrate',
  )
  next = replaceOnce(
    next,
    `  sectionCache.set(activeSectionId, { posts, loadedAt: Date.now(), hasMore, nextCursor })\n  return { posts, sections: [...sections], activeSectionId, hasMore, nextCursor }`,
    `  sectionCache.set(activeSectionId, { posts, loadedAt: Date.now(), hasMore, nextCursor, fromPersistent: false })\n  persistBoardCache()\n  return { posts, sections: [...sections], activeSectionId, hasMore, nextCursor }`,
    'board load persist',
  )
  next = replaceOnce(
    next,
    `  sectionCache.delete(String(response.sectionId))\n  sectionCache.delete('general')\n  return { sectionId: String(response.sectionId), movedCount: Number(response.movedCount || 0) }`,
    `  sectionCache.delete(String(response.sectionId))\n  sectionCache.delete('general')\n  persistBoardCache()\n  return { sectionId: String(response.sectionId), movedCount: Number(response.movedCount || 0) }`,
    'board deleted section persist',
  )
  return next
}

function patchBoardPage(source) {
  const stateMarker = `export function PreviewBoard({ profile = null, activitySignal = null }) {\n  const [posts, setPosts] = useState([])\n  const [sections, setSections] = useState(FALLBACK_SECTIONS)\n  const [activeSectionId, setActiveSectionId] = useState('general')\n  const [sectionDirection, setSectionDirection] = useState(1)\n  const [loading, setLoading] = useState(true)\n  const [refreshing, setRefreshing] = useState(false)\n  const [loadingMore, setLoadingMore] = useState(false)\n  const [hasMore, setHasMore] = useState(false)\n  const [nextCursor, setNextCursor] = useState('')`
  const stateReplacement = `export function PreviewBoard({ profile = null, activitySignal = null }) {\n  const initialCache = useMemo(() => peekPreviewBoardCache('general'), [])\n  const [posts, setPosts] = useState(() => initialCache?.posts || [])\n  const [sections, setSections] = useState(() => initialCache?.sections?.length ? initialCache.sections : FALLBACK_SECTIONS)\n  const [activeSectionId, setActiveSectionId] = useState('general')\n  const [sectionDirection, setSectionDirection] = useState(1)\n  const [loading, setLoading] = useState(() => !initialCache)\n  const [refreshing, setRefreshing] = useState(false)\n  const [loadingMore, setLoadingMore] = useState(false)\n  const [hasMore, setHasMore] = useState(() => Boolean(initialCache?.hasMore))\n  const [nextCursor, setNextCursor] = useState(() => String(initialCache?.nextCursor || ''))`
  let next = replaceOnce(source, stateMarker, stateReplacement, 'board initial cache state')
  next = replaceOnce(
    next,
    `      if (!cached.isFresh) refresh({ quiet: true, signal: controller.signal })`,
    `      if (cached.needsRevalidate) refresh({ quiet: true, signal: controller.signal })`,
    'board initial stale while revalidate',
  )
  return next
}

export function patchPreviewFastCacheSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/preview-board-client.js')) return patchBoardClient(source)
  if (cleanId.endsWith('/preview-board-complete.jsx')) return patchBoardPage(source)
  return String(source || '')
}
