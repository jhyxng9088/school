import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStationNavRefinementSource } from '../src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from '../src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from '../src/preview-nested-station-reaction-patch.js'
import { patchPreviewUnifiedStationPhysicsSource } from '../src/preview-unified-station-physics-patch.js'
import { patchPreviewPhysicalClassCouplingSource } from '../src/preview-physical-class-coupling-patch.js'
import { patchPreviewNestedGeometryCouplingSource } from '../src/preview-nested-geometry-coupling-patch.js'
import { patchPreviewNavResponsivenessSource } from '../src/preview-nav-responsiveness-patch.js'
import { patchPreviewClassTopSegmentSource } from '../src/preview-class-top-segment-patch.js'
import { patchPreviewClassTopSegmentStyleSource } from '../src/preview-class-top-segment-style-patch.js'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const boardUi = () => patchPreviewBoardSource(read('src/preview-board-complete.jsx'), '/workspace/src/preview-board-complete.jsx')

function buildBoardMain() {
  let source = read('src/main.jsx')
  const id = '/workspace/src/main.jsx'
  source = patchPreviewNavSpringSource(source, id)
  source = patchPreviewSHubV2Source(source, id)
  source = patchPreviewStationNavSource(source, id)
  source = patchPreviewStationNavRefinementSource(source, id)
  source = patchPreviewStationJellyMotionSource(source, id)
  source = patchPreviewNestedStationReactionSource(source, id)
  source = patchPreviewUnifiedStationPhysicsSource(source, id)
  source = patchPreviewPhysicalClassCouplingSource(source, id)
  source = patchPreviewNestedGeometryCouplingSource(source, id)
  source = patchPreviewNavResponsivenessSource(source, id)
  source = patchPreviewClassTopSegmentSource(source, id)
  source = patchPreviewClassTopSegmentStyleSource(source, id)
  source = patchPreviewBoardSource(source, id)
  return source
}

test('preview class board wires the standalone functional board without Firestore board signals', () => {
  const source = buildBoardMain()
  assert.match(source, /import \{ PreviewBoard \} from '\.\/preview-board\.jsx'/)
  assert.match(source, /function PreviewBoardPage\(\{ profile \}\)/)
  assert.match(source, /<PreviewBoard profile=\{profile\} \/>/)
  assert.match(source, /<PreviewBoardPage profile=\{profile\} \/>/)
  assert.doesNotMatch(source, /boardActivitySignal/)
  assert.equal(source.match(/function PreviewStudyPage\(\) \{/g)?.length, 1)
  assert.doesNotMatch(source, /게시판 자리까지 먼저 연결/)
})

test('class timetable and board content use keyed directional transition panels', () => {
  const source = buildBoardMain()
  assert.match(source, /key=\{section\}/)
  assert.match(source, /class-station-panel/)
  assert.match(source, /section === 'board' \? 'is-board' : 'is-timetable'/)
})

test('mobile class board keeps one page entrance instead of stacking full-board compositor layers', () => {
  const source = read('src/preview-board-finish.css')
  assert.match(source, /html\.school-mobile-compat \.class-station-panel\.is-board,[\s\S]*\.preview-board-page,[\s\S]*\.preview-board-section-view,[\s\S]*\.preview-board-card \{\s*animation: none;/)
  assert.match(read('src/preview-ai-background-patch.js'), /\.preview-station-page-host \{[\s\S]*animation: s-hub-ai-background-page-in/)
})

test('board API client authenticates with Firebase but stores board data through S-Hub Supabase', () => {
  const source = read('src/preview-board-client.js')
  assert.match(source, /ensureSignedIn/)
  assert.match(source, /getIdToken/)
  assert.match(source, /authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /elhlsqhzjmsfhmawrpqu\.supabase\.co\/functions\/v1\/class-board/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEYS/)
  assert.doesNotMatch(source, /mock|fixture|seedPosts/i)
})

test('board sections share reminder colors and filter real Supabase posts', () => {
  const client = read('src/preview-board-client.js')
  const ui = boardUi()
  assert.match(client, /url\.searchParams\.set\('section', sectionId\)/)
  assert.match(client, /createPreviewBoardSection\(label, color\)/)
  assert.match(client, /action: 'create-section', label, color/)
  assert.match(ui, /REMINDER_CATEGORY_COLORS/)
  assert.match(ui, /id: 'general', label: '일반', color: '#90939a'/)
  assert.match(ui, /id: 'question', label: '질문', color: '#7c83ff'/)
  assert.match(ui, /id: 'notes', label: '필기', color: '#56a781'/)
  assert.match(ui, /function BoardSections/)
  assert.match(ui, /createPreviewBoardSection\(label\.trim\(\), color\)/)
})

test('complete board UI covers CRUD pagination and Supabase realtime refresh', () => {
  const source = boardUi()
  for (const marker of [
    'createPreviewBoardPost',
    'addPreviewBoardComment',
    'resolvePreviewBoardQuestion',
    'editPreviewBoardPost',
    'deletePreviewBoardPost',
    'editPreviewBoardComment',
    'deletePreviewBoardComment',
    'editPreviewBoardSection',
    'deletePreviewBoardSection',
    'loadMore',
    'subscribePreviewBoardRealtime',
    'broadcastPreviewBoardRealtime',
  ]) assert.match(source, new RegExp(marker))
  assert.doesNotMatch(source, /recordClassActivity/)
  assert.doesNotMatch(source, /activitySignal/)
  assert.match(source, /maxLength=\{70\}/)
  assert.match(source, /maxLength=\{1200\}/)
  assert.match(source, /maxLength=\{500\}/)
  assert.match(source, /maxLength=\{16\}/)
  assert.match(source, /navigator\.onLine/)
  assert.match(source, /UnifiedBottomSheet/)
})

test('Supabase realtime messages are class-topic scoped and never carry board content', () => {
  const realtime = read('src/preview-board-realtime.js')
  assert.match(realtime, /functions\/v1\/board-realtime/)
  assert.match(realtime, /ensureSignedIn/)
  assert.match(realtime, /getIdToken/)
  assert.match(realtime, /sb_publishable_wzahH0kdX7gWmkrKvy9PDg_urg-7rs0/)
  assert.match(realtime, /events\/board_changed/)
  assert.match(realtime, /private: false/)
  assert.match(realtime, /return \{\s*at: Date\.now\(\),\s*kind: String\(source\.kind \|\| 'board'\)\.slice\(0, 20\),\s*sectionIds,\s*\}/s)
  assert.match(realtime, /const safe = safePayload\(payload\)/)
  assert.match(realtime, /body: JSON\.stringify\(safe\)/)
  assert.match(realtime, /HEARTBEAT_MS = 25_000/)
  assert.match(realtime, /RECONNECT_MAX_MS = 12_000/)
  assert.doesNotMatch(realtime, /SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEYS/)
  assert.doesNotMatch(realtime, /source\.(?:title|body|fileName|authorName)/)
})

test('moved posts notify only the old and new sections', () => {
  const source = boardUi()
  assert.match(source, /sectionHints\.length && !sectionHints\.includes\(activeSectionId\)/)
  assert.match(source, /announceMutation\(post\.id, 'added', \[post\.sectionId\]\)/)
  assert.match(source, /announceMutation\(updated\.id, 'edited', \[activeSectionId, updated\.sectionId\]\)/)
})

test('refresh control is text-only and compact', () => {
  const source = boardUi()
  const theme = read('src/preview-board-theme.css')
  const finish = read('src/preview-board-finish.css')
  assert.match(source, /refreshing \? '불러오는 중' : '새로고침'/)
  assert.doesNotMatch(source, /function RefreshIcon/)
  assert.match(theme, /\.preview-board-page[\s\S]*width: min\(100%, 760px\)/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*width: auto !important/)
  assert.match(finish, /min-width: 64px !important/)
})

test('board section chips and editor mirror reminder controls', () => {
  const ui = boardUi()
  const theme = read('src/preview-board-theme.css')
  assert.match(ui, /preview-board-section-dot/)
  assert.match(ui, /title="새 섹션"/)
  assert.match(ui, /preview-board-section-colors/)
  assert.match(theme, /\.preview-board-sections > button,[\s\S]*min-height: 30px/)
  assert.match(theme, /\.preview-board-section-dot,[\s\S]*width: 7px;[\s\S]*height: 7px/)
  assert.match(theme, /button\.preview-board-section-add[\s\S]*width: 30px;[\s\S]*border-radius: 50%/)
})

test('board motion remains mobile and accessibility safe', () => {
  const css = read('src/preview-board.css')
  const theme = read('src/preview-board-theme.css')
  const finish = read('src/preview-board-finish.css')
  const complete = read('src/preview-board-complete.css')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /html\.school-samsung/)
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(finish, /preview-board-section-view-in/)
  assert.match(complete, /@media \(prefers-reduced-motion: reduce\)/)
})

test('vite runs board wiring after the class top segment replacement', () => {
  const vite = read('vite.config.js')
  const classSegment = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const board = vite.indexOf('patchPreviewBoardSource(next, cleanId)')
  assert.ok(classSegment >= 0)
  assert.ok(board > classSegment)
  assert.match(vite, /preview-board-patch\.js/)
})
