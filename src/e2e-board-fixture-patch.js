function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`E2E board fixture marker missing: ${label}`)
  return source.replace(marker, replacement)
}

export function patchE2EBoardFixtureSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')
  if (!cleanId.endsWith('/preview-board-client.js')) return current
  if (current.includes('__S_HUB_E2E_BOARD_FIXTURE__')) return current

  const marker = `export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {\n  const includeSections = !cursor && (forceSections || !cachedSections.length || Date.now() - sectionsCachedAt > 5 * 60_000)`
  const replacement = `export async function loadPreviewBoard({ signal, sectionId = 'general', forceSections = false, cursor = '', append = false } = {}) {\n  const e2eFixture = globalThis.__S_HUB_E2E_BOARD_FIXTURE__\n  if (e2eFixture && typeof e2eFixture === 'object') {\n    const fixturePosts = uniquePosts(Array.isArray(e2eFixture.posts) ? e2eFixture.posts : [])\n    const fixtureSections = Array.isArray(e2eFixture.sections) ? e2eFixture.sections : []\n    const activeSectionId = String(e2eFixture.activeSectionId || sectionId || 'all')\n    sectionCache.set(activeSectionId, { posts: fixturePosts, loadedAt: Date.now(), hasMore: false, nextCursor: '' })\n    if (fixtureSections.length) {\n      cachedSections = fixtureSections\n      sectionsCachedAt = Date.now()\n    }\n    return {\n      posts: [...fixturePosts],\n      sections: [...fixtureSections],\n      activeSectionId,\n      hasMore: false,\n      nextCursor: '',\n    }\n  }\n  const includeSections = !cursor && (forceSections || !cachedSections.length || Date.now() - sectionsCachedAt > 5 * 60_000)`

  return replaceRequired(current, marker, replacement, 'loadPreviewBoard fixture seam')
}
