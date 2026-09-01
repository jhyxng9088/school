import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewFastCacheSource } from '../src/preview-fast-cache-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('persistent preview cache is student-scoped and bounded', () => {
  const cache = read('src/preview-fast-cache.js')
  assert.match(cache, /readStudentProfile/)
  assert.match(cache, /studentKeyFor/)
  assert.match(cache, /CACHE_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000/)
  assert.match(cache, /localStorage\.setItem/)
  assert.match(cache, /localStorage\.removeItem/)
  assert.doesNotMatch(cache, /SERVICE_ROLE|SUPABASE_SECRET|authorization/)
})

test('study paints cached or safe local state immediately and revalidates in background', () => {
  const client = patchPreviewFastCacheSource(read('src/preview-study-client.js'), '/workspace/src/preview-study-client.js')
  const page = patchPreviewFastCacheSource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(client, /export function peekPreviewStudyCache/)
  assert.match(client, /readPreviewPersistentCache\('study', normalizedScope\)/)
  assert.match(client, /writePreviewPersistentCache\('study', normalizedScope, snapshot\)/)
  assert.match(client, /resetCachedStudyDay/)
  assert.match(client, /totalSeconds: 0/)
  assert.match(client, /subjectTotals: \[\]/)

  assert.match(page, /initialClassSnapshot = useMemo\(\(\) => peekPreviewStudyCache/)
  assert.match(page, /useState\(initialClassSnapshot\)/)
  assert.match(page, /useState\(\(\) => !initialClassSnapshot\)/)
  assert.match(page, /loadSchool\(\{ silent: Boolean\(schoolSnapshot\) \}\)/)
  assert.match(page, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/)
})

test('board hydrates persistent cache before first visible state and quietly refreshes it', () => {
  const client = patchPreviewFastCacheSource(read('src/preview-board-client.js'), '/workspace/src/preview-board-client.js')
  const page = patchPreviewFastCacheSource(read('src/preview-board-complete.jsx'), '/workspace/src/preview-board-complete.jsx')

  assert.match(client, /function hydrateBoardCache/)
  assert.match(client, /readPreviewPersistentCache\('board', 'sections'\)/)
  assert.match(client, /writePreviewPersistentCache\('board', 'sections'/)
  assert.match(client, /posts: Array\.isArray\(value\?\.posts\) \? value\.posts\.slice\(0, BOARD_PAGE_SIZE\)/)
  assert.match(client, /needsRevalidate: Boolean\(cached\.fromPersistent\) \|\| !isFresh/)
  assert.match(client, /isPlaceholder: true/)
  assert.doesNotMatch(client, /attachmentUrlCache.*writePreviewPersistentCache/s)

  assert.match(page, /initialCache = useMemo\(\(\) => peekPreviewBoardCache\('general'\), \[\]\)/)
  assert.match(page, /useState\(\(\) => initialCache\?\.posts \|\| \[\]\)/)
  assert.match(page, /useState\(\(\) => !initialCache\)/)
  assert.match(page, /if \(cached\.needsRevalidate\) refresh\(\{ quiet: true/)
})

test('vite applies fast cache transform only as a preview build layer', () => {
  const config = read('vite.config.js')
  assert.match(config, /patchPreviewFastCacheSource/)
  assert.match(config, /next = patchPreviewFastCacheSource\(next, cleanId\)/)
  assert.match(config, /cleanId\.endsWith\('\/preview-fast-cache-patch\.js'\)/)
})
