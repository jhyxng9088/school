import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'
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
  const persistBlock = client.slice(client.indexOf('function persistBoardCache'), client.indexOf('function hydrateBoardCache'))
  assert.doesNotMatch(persistBlock, /attachmentUrlCache|expiresAt|access\.url/)

  assert.match(page, /initialCache = useMemo\(\(\) => peekPreviewBoardCache\('general'\), \[\]\)/)
  assert.match(page, /useState\(\(\) => initialCache\?\.posts \|\| \[\]\)/)
  assert.match(page, /useState\(\(\) => !initialCache\)/)
  assert.match(page, /if \(cached\.needsRevalidate\) refresh\(\{ quiet: true/)
})

test('board cache transform survives the real board realtime and unread rewrites', () => {
  const id = '/workspace/src/preview-board-complete.jsx'
  const cached = patchPreviewFastCacheSource(read('src/preview-board-complete.jsx'), id)
  const fullyPatched = patchPreviewBoardSource(cached, id)

  assert.match(fullyPatched, /const boardUnread = usePreviewBoardUnread\(profile\)/)
  assert.match(fullyPatched, /subscribePreviewBoardRealtime/)
  assert.match(fullyPatched, /initialCache = useMemo\(\(\) => peekPreviewBoardCache\('general'\), \[\]\)/)
  assert.match(fullyPatched, /cached\.needsRevalidate/)
})

test('vite applies fast cache before board runtime rewrites while preserving board-before-study main wiring', () => {
  const config = read('vite.config.js')
  const runtimeGuard = config.indexOf('if (boardRuntimeFile)')
  const cacheAt = config.indexOf('next = patchPreviewFastCacheSource(next, cleanId)', runtimeGuard)
  const boardAt = config.indexOf('next = patchPreviewBoardSource(next, cleanId)', runtimeGuard)
  const fallbackBoardAt = config.indexOf('next = patchPreviewBoardSource(next, cleanId)', boardAt + 1)
  const fallbackStudyAt = config.indexOf('next = patchPreviewStudySource(next, cleanId)', fallbackBoardAt)

  assert.ok(runtimeGuard >= 0)
  assert.ok(cacheAt > runtimeGuard && boardAt > cacheAt)
  assert.ok(fallbackBoardAt > boardAt && fallbackStudyAt > fallbackBoardAt)
  assert.match(config, /cleanId\.endsWith\('\/preview-fast-cache-patch\.js'\)/)
})
