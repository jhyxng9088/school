function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`E2E board fixture marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchBoardClientSource(source) {
  const current = String(source || '')
  if (current.includes('__S_HUB_E2E_BOARD_FIXTURE__')) return current

  const marker = `export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {`
  const replacement = `${marker}\n  const e2eFixture = globalThis.__S_HUB_E2E_BOARD_FIXTURE__\n  if (e2eFixture && typeof e2eFixture === 'object') {\n    const fixturePosts = uniquePosts(Array.isArray(e2eFixture.posts) ? e2eFixture.posts : [])\n    const fixtureSections = Array.isArray(e2eFixture.sections) ? e2eFixture.sections : []\n    const activeSectionId = String(e2eFixture.activeSectionId || sectionId || 'all')\n    sectionCache.set(activeSectionId, { posts: fixturePosts, loadedAt: Date.now(), hasMore: false, nextCursor: '' })\n    if (fixtureSections.length) {\n      cachedSections = fixtureSections\n      sectionsCachedAt = Date.now()\n    }\n    return {\n      posts: [...fixturePosts],\n      sections: [...fixtureSections],\n      activeSectionId,\n      hasMore: false,\n      nextCursor: '',\n    }\n  }\n`

  return replaceRequired(current, marker, replacement, 'loadPreviewBoard function')
}

function patchBoardRealtimeSource(source) {
  const sentinel = 'S_HUB_E2E_REALTIME_ISOLATION'
  let current = String(source || '')
  if (current.includes(sentinel)) return current

  const emptyReadState = `{ initialized: true, cursor: 0, seenCursor: 0, unread: [] }`

  const loadMarker = `export async function loadPreviewBoardEvents(since = null) {`
  current = replaceRequired(
    current,
    loadMarker,
    `${loadMarker}\n  // ${sentinel}: Playwright fixtures must never authenticate against or read production services.\n  if (globalThis.__S_HUB_E2E_BOARD_FIXTURE__) {\n    return { topic: 'e2e-board-fixture', cursor: 0, events: [], hasMore: false, readState: ${emptyReadState} }\n  }\n`,
    'loadPreviewBoardEvents function',
  )

  const postReadMarker = `export async function savePreviewBoardPostRead(postId, readCursor) {`
  current = replaceRequired(
    current,
    postReadMarker,
    `${postReadMarker}\n  if (globalThis.__S_HUB_E2E_BOARD_FIXTURE__) {\n    return ${emptyReadState}\n  }\n`,
    'savePreviewBoardPostRead function',
  )

  const sectionSeenMarker = `export async function savePreviewBoardSectionSeen(cursor) {`
  current = replaceRequired(
    current,
    sectionSeenMarker,
    `${sectionSeenMarker}\n  if (globalThis.__S_HUB_E2E_BOARD_FIXTURE__) {\n    return ${emptyReadState}\n  }\n`,
    'savePreviewBoardSectionSeen function',
  )

  const broadcastMarker = `export async function broadcastPreviewBoardRealtime(payload = {}) {`
  current = replaceRequired(
    current,
    broadcastMarker,
    `${broadcastMarker}\n  if (globalThis.__S_HUB_E2E_BOARD_FIXTURE__) {\n    return true\n  }\n`,
    'broadcastPreviewBoardRealtime function',
  )

  const subscribeMarker = `export async function subscribePreviewBoardRealtime(onChange) {`
  current = replaceRequired(
    current,
    subscribeMarker,
    `${subscribeMarker}\n  if (globalThis.__S_HUB_E2E_BOARD_FIXTURE__) {\n    return () => {}\n  }\n`,
    'subscribePreviewBoardRealtime function',
  )

  return current
}

export function patchE2EBoardFixtureSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (cleanId.endsWith('/preview-board-client.js')) return patchBoardClientSource(current)
  if (cleanId.endsWith('/preview-board-realtime.js')) return patchBoardRealtimeSource(current)
  return current
}
