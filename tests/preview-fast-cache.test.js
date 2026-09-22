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

test('study uses current-day cache data and carries only recent live state across midnight', () => {
  const rawClient = read('src/preview-study-client.js')
  const rawPage = read('src/preview-study.jsx')
  const client = patchPreviewFastCacheSource(rawClient, '/workspace/src/preview-study-client.js')
  const page = patchPreviewFastCacheSource(rawPage, '/workspace/src/preview-study.jsx')

  assert.equal(client, rawClient)
  assert.equal(page, rawPage)
  assert.match(client, /export function peekPreviewStudyCache/)
  assert.match(client, /readPreviewPersistentCache\('study', normalizedScope\)/)
  assert.match(client, /writePreviewPersistentCache\('study', normalizedScope, snapshot\)/)
  assert.match(client, /if \(!stored \|\| !Array\.isArray\(stored\.students\)\) return null/)
  assert.match(client, /if \(normalized\.date === today\) return normalized/)
  assert.match(client, /STUDY_ACTIVE_CARRYOVER_MS/)
  assert.match(client, /activeCarryover: true/)
  assert.doesNotMatch(client, /emptyStudySnapshot|resetCachedStudyDay/)
  assert.doesNotMatch(client, /generatedAt:\s*0/)

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
  assert.match(page, /useState\(\(\) => !initialCache \|\| Boolean\(initialCache\.isPlaceholder\)\)/)
  assert.match(page, /setLoading\(Boolean\(cached\.isPlaceholder\)\)/)
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


test('home live signals hydrate cached presence and keep unknown states neutral', () => {
  const sync = read('src/school-sync.js')
  const unread = read('src/preview-study-unread.js')
  const signals = read('src/preview-home-signals.jsx')
  const signalStyle = read('src/preview-home-signals.css')
  const main = read('src/main.jsx')

  assert.match(sync, /PRESENCE_SNAPSHOT_CACHE_MS = 60 \* 1000/)
  assert.match(sync, /useState\(\(\) => readPresenceInitialCounts\(profile\)\)/)
  assert.match(sync, /school\.presenceSnapshot\.v1/)
  assert.match(sync, /const next = \{ \.\.\.current, online, ready: true, liveReady: true \}/)
  assert.match(sync, /writePresenceSnapshotCache\(profile, next\)/)

  assert.match(unread, /initialized: Boolean\(controller\.state\.initialized\)/)
  assert.match(unread, /syncedThisLaunch: controller\.state\.syncedThisLaunch === true/)
  assert.match(signals, /presence\?\.ready === true/)
  assert.match(signals, /presence\?\.launchCachedReady === true[\s\S]*presence\?\.liveReady === true && presence\?\.totalReady === true/)
  assert.match(signals, /studyUnread\?\.initialized !== false/)
  assert.match(signals, /pending: !presenceReady/)
  assert.match(signals, /pending: !studyReady/)
  assert.match(signals, /접속 상태 확인 중/)
  assert.match(signals, /스터디 상태 확인 중/)

  assert.match(main, /const showPresenceCount = presenceReady && \(presence\.online > 0 \|\| presence\.total > 0\)/)
  assert.match(main, /aria-hidden=\{!showPresenceCount\}/)
  assert.match(signalStyle, /\.preview-home-signal\.is-pending strong/)
  assert.match(signalStyle, /visibility: hidden/)
  assert.match(signalStyle, /opacity: 0/)
  assert.match(signalStyle, /transition: opacity 220ms var\(--motion-soft\)/)
})


test('configured startup warms current Study status during launch and leaves secondary data in background', () => {
  const bootstrap = read('src/app-bootstrap.jsx')
  const main = read('src/main.jsx')

  assert.match(bootstrap, /async function warmLaunchStudyStatus\(\)/)
  assert.match(bootstrap, /STUDY_LAUNCH_NETWORK_BUDGET_MS = 700/)
  assert.match(bootstrap, /peekPreviewStudyCache\(\{ scope: 'class' \}\)/)
  assert.match(bootstrap, /const refresh = loadPreviewStudy\(\{ scope: 'class', period: 'today' \}\)/)
  assert.match(bootstrap, /if \(cached\)[\s\S]*return true/)
  assert.match(bootstrap, /Promise\.race\(/)
  assert.match(bootstrap, /window\.__shubLaunchStudyStatus = warmLaunchStudyStatus\(\)/)
  assert.match(bootstrap, /async function warmHighValueInteractiveData\(\)/)
  assert.match(bootstrap, /loadPreviewBoard\(\{ sectionId: 'general', forceSections: false \}\)/)
  assert.match(bootstrap, /preloadClassRoster\(\)/)
  assert.doesNotMatch(bootstrap, /preloadConfiguredAppData|preloadPreviewBoard\(/)
  assert.match(main, /const \[studyStatusLaunchReady, setStudyStatusLaunchReady\]/)
  assert.match(main, /window\.__shubLaunchStudyStatus/)
  assert.match(main, /studyStatusLaunchReady === true/)

  const studyWarmAt = bootstrap.indexOf('window.__shubLaunchStudyStatus = warmLaunchStudyStatus()')
  const mountAt = bootstrap.indexOf('mainModule.mountMainApp()')
  const warmAt = bootstrap.indexOf('void warmHighValueInteractiveData()', mountAt)
  assert.ok(studyWarmAt >= 0 && studyWarmAt < mountAt)
  assert.ok(mountAt >= 0)
  assert.ok(warmAt > mountAt)
})


test('Study optimistic state is persisted immediately so current status survives a quick relaunch', () => {
  const client = read('src/preview-study-client.js')
  const study = read('src/preview-study.jsx')

  assert.match(client, /export function patchPreviewStudyActiveCache\(active\)/)
  assert.match(client, /writePreviewPersistentCache\('study', 'class'/)
  assert.match(client, /generatedAt: Date\.now\(\)/)
  assert.match(study, /patchPreviewStudyActiveCache\(optimisticActive\)/)
  assert.match(study, /patchPreviewStudyActiveCache\(pausedActive\)/)
  assert.match(study, /patchPreviewStudyActiveCache\(resumedActive\)/)
  assert.match(study, /patchPreviewStudyActiveCache\(null\)/)
  assert.match(study, /patchPreviewStudyActiveCache\(active\)/)
})


test('Study current activity survives the KST date boundary without carrying yesterday totals', () => {
  const client = read('src/preview-study-client.js')
  assert.match(client, /STUDY_ACTIVE_CARRYOVER_MS = 45 \* 60 \* 1000/)
  assert.match(client, /Daily totals reset at midnight, but an active Study session does not/)
  assert.match(client, /totalSeconds: 0/)
  assert.match(client, /subjectTotals: \[\]/)
  assert.match(client, /student\?\.active \|\| student\?\.studentKey === me\?\.studentKey/)
  assert.match(client, /activeCarryover: true/)
})
