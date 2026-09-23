import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { POLITE_COPY_REPLACEMENTS, POLITE_SOURCE_FRAGMENTS } from '../src/polite-copy-runtime.js'
import { PREVIEW_POLITE_COPY_REPLACEMENTS } from '../src/preview-polite-copy-additions.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function replacePairs(source, pairs) {
  let next = String(source || '')
  for (const [from, to] of pairs) next = next.split(from).join(to)
  return next
}

test('tab changes reset the shared document scroll position before the new page settles', () => {
  const source = read('src/main.jsx')
  assert.match(source, /useLayoutEffect\(\(\) => \{[\s\S]*?window\.scrollTo\(0, 0\)[\s\S]*?\}, \[activeTab\]\)/)
  assert.match(source, /document\.scrollingElement/)
})

test('reported Safari and reminder-section copy is polite after the V2 build transform', () => {
  const main = read('src/main.jsx')
  const todo = read('src/todo-stage5-ai.jsx')
  const replacements = [
    ...POLITE_COPY_REPLACEMENTS,
    ...PREVIEW_POLITE_COPY_REPLACEMENTS,
    ...POLITE_SOURCE_FRAGMENTS,
  ]
  const builtMain = replacePairs(main, replacements)
  const builtTodo = replacePairs(todo, replacements)

  assert.match(builtMain, /Safari에서 홈 화면에 추가해 주세요/)
  assert.doesNotMatch(builtMain, /Safari에서 홈 화면에 추가해줘/)
  assert.match(builtMain, /S-Hub를 웹 앱으로 추가해 주세요/)
  assert.match(builtTodo, /리마인더를 구분할 이름과 색상을 골라 주세요/)
  assert.doesNotMatch(builtTodo, /이미 사용 중인 색이야/)
  assert.doesNotMatch(builtMain, /installPoliteCopyRuntime\(\)/)
})

test('the seven question examples remain deliberately informal', () => {
  const preserved = [
    '이번 주에 뭐 제출해야 돼?',
    '다음 시험 언제야?',
    '내일 시간표 뭐야?',
    '이번 주 시간표 바뀐 거 있어?',
    '예: 이건 수행평가 공지야.',
    '예: 마감일과 준비물만 찾아줘.',
    '예: 시간표 변경도 같이 확인해줘.',
  ]
  const sources = PREVIEW_POLITE_COPY_REPLACEMENTS.map(([from]) => from)
  preserved.forEach((text) => assert.equal(sources.includes(text), false))
})

test('production service worker cache is bumped so installed PWAs receive the fresh UI shell', () => {
  const sw = read('public/sw.js')
  assert.match(sw, /const CACHE_NAME = 'school-shell-v176-stale-shell-recovery'/)
  assert.doesNotMatch(sw, /school-preview-shell-/)
  assert.match(sw, /self\.skipWaiting\(\)/)
  assert.match(sw, /self\.clients\.claim\(\)/)
})

test('production V2 config applies feature patches without preview identity rewrites', () => {
  const config = read('vite.config.js')
  assert.match(config, /school-s-hub-v2-features/)
  assert.doesNotMatch(config, /patchPreviewSHubV2Source/)
  assert.doesNotMatch(config, /patchPreviewAIReminderSummarySource/)
  assert.doesNotMatch(config, /previewLocalStorageText/)
  assert.doesNotMatch(config, /school-sync-preview/)
  assert.doesNotMatch(config, /preview-class-\$\{normalized\.classNumber\}/)
})

test('board and Study use lightweight per-element entry motion instead of one large page transform', () => {
  const board = read('src/preview-board-finish.css')
  const study = read('src/preview-study.css')
  assert.match(board, /\.preview-board-header[\s\S]*preview-board-entry-item/)
  assert.match(board, /nth-child\(-n \+ 6\)/)
  assert.doesNotMatch(board, /school-mobile-compat[\s\S]*preview-board-card \{\s*animation: none/)
  assert.match(study, /\.preview-study-control-card[\s\S]*preview-study-entry-item/)
  assert.match(study, /preview-study-ranking-section/)
  assert.match(study, /app-content:has\(\.preview-study-page\)[\s\S]*animation: none/)
})

test('launch preload overlaps independent roster, board, and timetable work', () => {
  const launch = read('src/launch-data-preload.js')
  const boardClient = read('src/preview-board-client.js')
  const schoolSync = read('src/school-sync.js')
  assert.match(launch, /Promise\.all\(\[[\s\S]*preloadClassPresence[\s\S]*preloadClassRoster/)
  assert.match(boardClient, /Promise\.all\(sectionIds\.map/)
  assert.match(schoolSync, /Promise\.all\(\[[\s\S]*getDocFromServer\(timetableRef\(profile\)\)[\s\S]*requestPersonalTimetable/)
})


test('Board and Study entrance timing stays near the canonical tab pace', () => {
  const board = read('src/preview-board-finish.css')
  const study = read('src/preview-study.css')
  const index = read('index.html')
  assert.match(index, /app-content:has\(> \.todo-page\)[\s\S]*980ms/)
  assert.match(index, /school-mobile-compat[\s\S]*animation-duration: 760ms/)
  assert.match(board, /preview-board-entry-item 820ms/)
  assert.match(study, /preview-study-entry-item 820ms/)
  assert.match(study, /preview-study-entry-item 840ms 255ms/)
})


test('launch reuses cached board topology and avoids duplicate critical-path work', () => {
  const launch = read('src/launch-data-preload.js')
  const board = read('src/preview-board-client.js')
  const academic = read('src/class-activity.js')
  const preloadAcademic = academic.slice(
    academic.indexOf('export async function preloadSharedAcademic'),
    academic.indexOf('export function useSharedAcademic'),
  )
  assert.match(launch, /label: 'board', retry: false/)
  assert.match(board, /const cached = peekPreviewBoardCache\('general'\)/)
  assert.match(board, /const warmBySection = new Map/)
  assert.match(preloadAcademic, /await ensureSignedIn\(\)/)
  assert.doesNotMatch(preloadAcademic, /ensureIdentity/)
})

test('class and schedule top segments share one canonical spring owner', () => {
  const segment = read('src/preview-class-top-segment-patch.js')
  const schedule = read('src/preview-schedule-top-segment-patch.js')
  const spring = read('src/s-hub-segment-spring.js')
  const helper = segment.slice(
    segment.indexOf('function useClassTopSegmentSpring'),
    segment.indexOf('function ClassTopSegment'),
  )
  const classComponent = segment.slice(
    segment.indexOf('function ClassTopSegment'),
    segment.indexOf('function ClassStationPage'),
  )
  assert.match(helper, /useSHubSegmentSpring\(activeIndex/)
  assert.match(helper, /deform: true/)
  assert.match(helper, /shellElastic: true/)
  assert.match(classComponent, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(classComponent, /useSHubSegmentSpring|deform:/)
  assert.match(schedule, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.match(spring, /stiffness: 56/)
  assert.match(spring, /damping: 10\.5/)
  assert.match(spring, /stretchPerVelocity: 0\.032/)
  assert.match(spring, /compressionVelocity: 18000/)
})


test('fresh board launch warms built-in sections before the general response', () => {
  const board = read('src/preview-board-client.js')
  assert.match(board, /const warmSectionIds = \[\.\.\.new Set\(\[/)
  assert.match(board, /'question'/)
  assert.match(board, /'notes'/)
  assert.match(board, /const warmBySection = new Map\(warmSectionIds\.map/)
})


test('schedule top segment keeps bottom-nav pill and shell physics coupled', () => {
  const segment = read('src/preview-class-top-segment-patch.js')
  const start = segment.indexOf('function useClassTopSegmentSpring(activeIndex) {')
  const end = segment.indexOf('function ClassTopSegment', start)
  const helper = segment.slice(start, end)
  assert.match(helper, /deform: true/)
  assert.match(helper, /shellElastic: true/)
})


test('class section entry motion is scoped below the persistent top segment', () => {
  const classSegment = read('src/preview-class-top-segment-patch.js')
  const board = read('src/preview-board.css')
  const boardFinish = read('src/preview-board-finish.css')
  assert.match(board, /\.class-station-panel \{[\s\S]*animation: class-station-panel-enter/)
  assert.match(
    classSegment,
    /\.class-station-page > \.class-top-segment,[\s\S]*animation: none !important;/,
  )
  assert.match(boardFinish, /html body \.app-content\.tab-class,[\s\S]*animation: none !important;/)
  assert.doesNotMatch(boardFinish, /\.app-content:has\(\.preview-board-page\)/)
})
