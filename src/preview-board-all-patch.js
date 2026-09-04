function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview board all marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchBoardClient(source) {
  let next = String(source || '')
  if (next.includes('BOARD_ALL_API_URL') && next.includes('BOARD_SECTION_API_URL')) return next

  next = replaceRequired(
    next,
    `const BOARD_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board'`,
    `const BOARD_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board'\nconst BOARD_ALL_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board-all'\nconst BOARD_SECTION_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board-sections'`,
    'aggregate and stable section endpoints',
  )

  next = replaceRequired(
    next,
    `  const url = new URL(BOARD_API_URL)\n  if (method === 'GET' && sectionId) url.searchParams.set('section', sectionId)`,
    `  const aggregateGet = method === 'GET' && sectionId === 'all'\n  const url = new URL(aggregateGet ? BOARD_ALL_API_URL : BOARD_API_URL)\n  if (method === 'GET' && sectionId && !aggregateGet) url.searchParams.set('section', sectionId)`,
    'aggregate GET routing',
  )

  next = replaceRequired(
    next,
    `function uniquePosts(posts = []) {`,
    `async function requestBoardSections({ method = 'GET', payload = null, signal } = {}) {\n  const headers = await authHeaders('application/json')\n  const options = { method, headers, cache: 'no-store', signal }\n  if (payload) options.body = JSON.stringify(payload)\n  let response\n  try {\n    response = await fetch(BOARD_SECTION_API_URL, options)\n  } catch (error) {\n    if (error?.name === 'AbortError') throw error\n    throw boardError('board/network', '게시판 섹션 서버에 연결하지 못했어요.')\n  }\n  return parseBoardResponse(response)\n}\n\nfunction uniquePosts(posts = []) {`,
    'stable section request owner',
  )

  next = replaceRequired(
    next,
    `  const body = await requestBoard({ method: 'GET', signal, sectionId, includeSections, cursor })\n  const pagePosts = Array.isArray(body.posts) ? body.posts : []\n  const sections = Array.isArray(body.sections) && body.sections.length ? body.sections : cachedSections\n  if (Array.isArray(body.sections) && body.sections.length) {\n    cachedSections = body.sections\n    sectionsCachedAt = Date.now()\n  }`,
    `  const body = await requestBoard({ method: 'GET', signal, sectionId, includeSections, cursor })\n  let stableSectionBody = null\n  if (includeSections) {\n    try {\n      stableSectionBody = await requestBoardSections({ signal })\n    } catch (sectionError) {\n      if (sectionError?.name === 'AbortError') throw sectionError\n      console.warn('S-Hub stable board section ownership unavailable:', sectionError)\n    }\n  }\n  const pagePosts = Array.isArray(body.posts) ? body.posts : []\n  const responseSections = Array.isArray(stableSectionBody?.sections) && stableSectionBody.sections.length\n    ? stableSectionBody.sections\n    : body.sections\n  const sections = Array.isArray(responseSections) && responseSections.length ? responseSections : cachedSections\n  if (Array.isArray(responseSections) && responseSections.length) {\n    cachedSections = responseSections\n    sectionsCachedAt = Date.now()\n  }`,
    'stable section ownership refresh',
  )

  next = replaceRequired(
    next,
    `export async function createPreviewBoardSection(label, color) {\n  const response = await requestBoard({`,
    `export async function createPreviewBoardSection(label, color) {\n  const response = await requestBoardSections({`,
    'stable section create route',
  )

  next = replaceRequired(
    next,
    `export async function editPreviewBoardSection(sectionId, label, color) {\n  const response = await requestBoard({`,
    `export async function editPreviewBoardSection(sectionId, label, color) {\n  const response = await requestBoardSections({`,
    'stable section edit route',
  )

  next = replaceRequired(
    next,
    `export async function deletePreviewBoardSection(sectionId) {\n  const response = await requestBoard({`,
    `export async function deletePreviewBoardSection(sectionId) {\n  const response = await requestBoardSections({`,
    'stable section delete route',
  )

  return next
}

function patchBoardComplete(source) {
  let next = String(source || '')
  if (next.includes('const ALL_BOARD_SECTION =')) return next

  next = replaceRequired(
    next,
    `const FALLBACK_SECTIONS = [\n  { id: 'general', label: '일반', color: '#90939a', builtin: true, ownedByMe: false },\n  { id: 'question', label: '질문', color: '#7c83ff', builtin: true, ownedByMe: false },\n  { id: 'notes', label: '필기', color: '#56a781', builtin: true, ownedByMe: false },\n]`,
    `const FALLBACK_SECTIONS = [\n  { id: 'general', label: '일반', color: '#90939a', builtin: true, ownedByMe: false },\n  { id: 'question', label: '질문', color: '#7c83ff', builtin: true, ownedByMe: false },\n  { id: 'notes', label: '필기', color: '#56a781', builtin: true, ownedByMe: false },\n]\n\nconst ALL_BOARD_SECTION = { id: 'all', label: '전체', color: '', builtin: true, ownedByMe: false, aggregate: true }`,
    'virtual all section',
  )

  next = replaceRequired(
    next,
    `function sectionFor(sectionId, sections) {\n  return sections.find((section) => section.id === sectionId) || FALLBACK_SECTIONS[0]\n}`,
    `function sectionFor(sectionId, sections) {\n  if (sectionId === ALL_BOARD_SECTION.id) return ALL_BOARD_SECTION\n  return sections.find((section) => section.id === sectionId) || FALLBACK_SECTIONS[0]\n}`,
    'all section lookup',
  )

  next = replaceRequired(
    next,
    `        {sections.map((section) => (`,
    `        {[ALL_BOARD_SECTION, ...sections].map((section) => (`,
    'all section filter button',
  )

  next = replaceRequired(
    next,
    `  const [activeSectionId, setActiveSectionId] = useState('general')`,
    `  const [activeSectionId, setActiveSectionId] = useState('all')`,
    'default all section',
  )

  next = replaceRequired(
    next,
    `  const [detailPostId, setDetailPostId] = useState('')\n  const [postEditorId, setPostEditorId] = useState('')`,
    `  const [detailPostId, setDetailPostId] = useState('')\n  const [postEditorId, setPostEditorId] = useState('')\n  const [retainedDetailPost, setRetainedDetailPost] = useState(null)`,
    'retain board detail during close',
  )

  next = replaceRequired(
    next,
    `  const detailPost = useMemo(() => posts.find((post) => post.id === detailPostId) || null, [posts, detailPostId])`,
    `  const detailPost = useMemo(() => posts.find((post) => post.id === detailPostId) || retainedDetailPost, [posts, detailPostId, retainedDetailPost])`,
    'board detail retained data',
  )

  next = replaceRequired(
    next,
    `    const currentIndex = Math.max(0, sections.findIndex((section) => section.id === activeSectionId))\n    const nextIndex = Math.max(0, sections.findIndex((section) => section.id === sectionId))`,
    `    const filterSections = [ALL_BOARD_SECTION, ...sections]\n    const currentIndex = Math.max(0, filterSections.findIndex((section) => section.id === activeSectionId))\n    const nextIndex = Math.max(0, filterSections.findIndex((section) => section.id === sectionId))`,
    'all section transition ordering',
  )

  next = replaceRequired(
    next,
    `    if (updated.sectionId !== activeSectionId) {`,
    `    if (activeSectionId !== 'all' && updated.sectionId !== activeSectionId) {`,
    'aggregate post upsert',
  )

  next = replaceRequired(
    next,
    `    if (post.sectionId !== activeSectionId) {`,
    `    if (activeSectionId !== 'all' && post.sectionId !== activeSectionId) {`,
    'aggregate created post',
  )

  next = replaceRequired(
    next,
    `    const moved = updated.sectionId !== activeSectionId`,
    `    const moved = activeSectionId !== 'all' && updated.sectionId !== activeSectionId`,
    'aggregate edited post',
  )

  next = replaceRequired(
    next,
    `setDetailPostId(post.id)`,
    `setRetainedDetailPost(post); setDetailPostId(post.id)`,
    'retain board detail on open',
  )

  next = replaceRequired(
    next,
    `      <BoardComposer open={composerOpen} sections={sections} initialSectionId={activeSectionId} onClose={() => setComposerOpen(false)} onCreated={addCreatedPost} />`,
    `      <BoardComposer open={composerOpen} sections={sections} initialSectionId={activeSectionId === 'all' ? 'general' : activeSectionId} onClose={() => setComposerOpen(false)} onCreated={addCreatedPost} />`,
    'aggregate composer fallback',
  )

  next = replaceRequired(
    next,
    `      <BoardDetail post={detailPost} sections={sections} meKey={meKey} open={Boolean(detailPost)} onClose={() => setDetailPostId('')} onUpdated={upsertPost} onEditPost={() => setPostEditorId(detailPost?.id || '')} onMutated={announceMutation} />`,
    `      <BoardDetail post={detailPost} sections={sections} meKey={meKey} open={Boolean(detailPostId && detailPost)} onClose={() => setDetailPostId('')} onUpdated={upsertPost} onEditPost={() => setPostEditorId(detailPost?.id || '')} onMutated={announceMutation} />`,
    'board detail close state separation',
  )

  const realtimeFilter = `      if (sectionHints.length && !sectionHints.includes(activeSectionId) && event?.kind !== 'section') return`
  if (next.includes(realtimeFilter)) {
    next = next.replace(
      realtimeFilter,
      `      if (activeSectionId !== 'all' && sectionHints.length && !sectionHints.includes(activeSectionId) && event?.kind !== 'section') return`,
    )
  }

  const announceMarker = `  function announceMutation(entityId, action = 'edited', sectionIds = [activeSectionId]) {\n    if (!entityId) return\n    const kind = String(entityId).startsWith('section:') ? 'section' : action === 'added' ? 'post' : 'board'\n    void broadcastPreviewBoardRealtime({ kind, sectionIds })\n  }`
  if (next.includes(announceMarker)) {
    next = next.replace(
      announceMarker,
      `  function announceMutation(entityId, action = 'edited', sectionIds = [activeSectionId]) {\n    if (!entityId) return\n    const kind = String(entityId).startsWith('section:') ? 'section' : action === 'added' ? 'post' : 'board'\n    let resolvedSectionIds = (Array.isArray(sectionIds) ? sectionIds : [sectionIds])\n      .map((value) => String(value || '').trim())\n      .filter((value) => value && value !== 'all')\n    if (!resolvedSectionIds.length && kind !== 'section') {\n      const currentPost = posts.find((post) => post.id === entityId)\n      if (currentPost?.sectionId) resolvedSectionIds = [currentPost.sectionId]\n    }\n    void broadcastPreviewBoardRealtime({ kind, sectionIds: [...new Set(resolvedSectionIds)].slice(0, 2) })\n  }`,
    )
  }

  return next
}

function patchMainUnreadConsistency(source) {
  let next = String(source || '')
  next = next.split('hasBoardUnread={boardUnread.hasUnread}').join('hasBoardUnread={boardUnread.hasSectionUnread}')
  next = next
    .split("tab.id === 'class' && boardUnread.hasUnread ? 'has-board-unread' : ''")
    .join("tab.id === 'class' && boardUnread.hasSectionUnread ? 'has-board-unread' : ''")
  return next
}

export function patchPreviewBoardAllSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (cleanId.endsWith('/preview-board-client.js')) return patchBoardClient(current)
  if (cleanId.endsWith('/preview-board-complete.jsx')) return patchBoardComplete(current)
  if (cleanId.endsWith('/main.jsx')) return patchMainUnreadConsistency(current)
  return current
}
