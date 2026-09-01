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

test('preview class board replaces the placeholder with the functional board component', () => {
  const source = buildBoardMain()
  assert.match(source, /import \{ PreviewBoard \} from '\.\/preview-board\.jsx'/)
  assert.match(source, /import '\.\/preview-board-theme\.css'/)
  assert.match(source, /function PreviewBoardPage\(\) \{\s*return <PreviewBoard \/>/)
  assert.equal(source.match(/function PreviewStudyPage\(\) \{/g)?.length, 1)
  assert.doesNotMatch(source, /게시판 자리까지 먼저 연결/)
})

test('class timetable and board content use keyed directional transition panels', () => {
  const source = buildBoardMain()
  assert.match(source, /key=\{section\}/)
  assert.match(source, /class-station-panel/)
  assert.match(source, /section === 'board' \? 'is-board' : 'is-timetable'/)
})

test('board API client authenticates with Firebase but stores board data through S-Hub Supabase', () => {
  const source = read('src/preview-board-client.js')
  assert.match(source, /ensureSignedIn/)
  assert.match(source, /getIdToken/)
  assert.match(source, /authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /elhlsqhzjmsfhmawrpqu\.supabase\.co\/functions\/v1\/class-board/)
  assert.doesNotMatch(source, /class-roster/)
  assert.doesNotMatch(source, /resource: 'board'/)
  assert.doesNotMatch(source, /\?resource=board/)
  assert.doesNotMatch(source, /mock|fixture|seedPosts/i)
})

test('board sections are Supabase-backed with shared colors and filter real posts', () => {
  const client = read('src/preview-board-client.js')
  const ui = read('src/preview-board.jsx')
  assert.match(client, /url\.searchParams\.set\('section', sectionId\)/)
  assert.match(client, /createPreviewBoardSection\(label, color\)/)
  assert.match(client, /action: 'create-section', label, color/)
  assert.match(client, /payload: \{ action: 'create', sectionId, title, body, attachments:/)
  assert.match(ui, /REMINDER_CATEGORY_COLORS/)
  assert.match(ui, /id: 'general', label: '일반', color: '#90939a'/)
  assert.match(ui, /id: 'question', label: '질문', color: '#7c83ff'/)
  assert.match(ui, /id: 'notes', label: '필기', color: '#56a781'/)
  assert.match(ui, /function BoardSections/)
  assert.match(ui, /createPreviewBoardSection\(label\.trim\(\), color\)/)
  assert.match(ui, /loadPreviewBoard\(\{ signal, sectionId: activeSectionId \}\)/)
})

test('board UI covers writes, comments, resolve, offline and server limits', () => {
  const source = read('src/preview-board.jsx')
  assert.match(source, /createPreviewBoardPost/)
  assert.match(source, /addPreviewBoardComment/)
  assert.match(source, /resolvePreviewBoardQuestion/)
  assert.match(source, /post\.sectionId === 'question'/)
  assert.match(source, /maxLength=\{70\}/)
  assert.match(source, /maxLength=\{1200\}/)
  assert.match(source, /maxLength=\{500\}/)
  assert.match(source, /maxLength=\{16\}/)
  assert.match(source, /navigator\.onLine/)
  assert.match(source, /UnifiedBottomSheet/)
  assert.match(source, /window\.addEventListener\('online', revalidate\)/)
})

test('refresh control is text-only with no refresh SVG icon', () => {
  const source = read('src/preview-board.jsx')
  assert.match(source, />\s*새로고침\s*<\/button>/)
  assert.doesNotMatch(source, /function RefreshIcon/)
  assert.doesNotMatch(source, /preview-board-refresh[^>]*>[\s\S]*?<svg/)
})

test('board layout stays centered and refresh is a compact text button', () => {
  const theme = read('src/preview-board-theme.css')
  const finish = read('src/preview-board-finish.css')
  assert.match(theme, /\.preview-board-page[\s\S]*width: min\(100%, 760px\)/)
  assert.match(theme, /\.preview-board-page[\s\S]*max-width: 760px/)
  assert.match(theme, /\.preview-board-page[\s\S]*margin-inline: auto/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*width: auto !important/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*min-width: 64px !important/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*height: 30px !important/)
  assert.match(finish, /\.preview-board-refresh[\s\S]*white-space: nowrap/)
  assert.doesNotMatch(theme, /\.preview-board-refresh::after/)
  assert.doesNotMatch(theme, /\.preview-board-refresh svg/)
})

test('board section chips mirror reminder pills, dots and circular add control', () => {
  const ui = read('src/preview-board.jsx')
  const theme = read('src/preview-board-theme.css')
  assert.match(ui, /preview-board-section-dot/)
  assert.match(theme, /\.preview-board-sections > button,[\s\S]*min-height: 30px/)
  assert.match(theme, /\.preview-board-sections > button,[\s\S]*border-radius: 999px/)
  assert.match(theme, /\.preview-board-section-dot,[\s\S]*width: 7px;[\s\S]*height: 7px/)
  assert.match(theme, /button\.preview-board-section-add[\s\S]*width: 30px;[\s\S]*border-radius: 50%/)
  assert.match(theme, /\.preview-board-sections > button\.is-active[\s\S]*background: var\(--text\)/)
})

test('new board section sheet mirrors reminder name and color picker controls', () => {
  const ui = read('src/preview-board.jsx')
  const theme = read('src/preview-board-theme.css')
  assert.match(ui, /title="새 섹션"/)
  assert.match(ui, /게시판을 구분할 이름과 색상을 골라 주세요/)
  assert.match(ui, /preview-board-section-colors/)
  assert.match(ui, /disabled=\{used \|\| pending\}/)
  assert.match(theme, /\.preview-board-section-colors > div[\s\S]*grid-template-columns: repeat\(6, 38px\)/)
  assert.match(theme, /\.preview-board-section-colors button > span[\s\S]*width: 22px;[\s\S]*height: 22px/)
  assert.match(theme, /\.preview-board-section-colors button\.is-selected[\s\S]*transform: scale\(1\.08\)/)
  assert.match(theme, /\.preview-board-section-actions[\s\S]*grid-template-columns: 1fr 1\.4fr/)
})

test('board motion remains mobile and accessibility safe', () => {
  const css = read('src/preview-board.css')
  const theme = read('src/preview-board-theme.css')
  const finish = read('src/preview-board-finish.css')
  assert.match(css, /\.class-station-panel\.is-board[\s\S]*--class-panel-enter-x: 14px/)
  assert.match(css, /\.class-station-panel\.is-timetable[\s\S]*--class-panel-enter-x: -14px/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /html\.school-samsung/)
  assert.match(css, /@media \(max-width: 430px\)/)
  assert.match(theme, /html\.school-samsung/)
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(finish, /preview-board-section-view-in/)
  assert.match(finish, /cubic-bezier\(\.16, 1, \.3, 1\)/)
  assert.match(finish, /@media \(prefers-reduced-motion: reduce\)/)
})

test('vite runs board wiring after the class top segment replacement', () => {
  const vite = read('vite.config.js')
  const classSegment = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const board = vite.indexOf('patchPreviewBoardSource(next, cleanId)')
  assert.ok(classSegment >= 0)
  assert.ok(board > classSegment)
  assert.match(vite, /preview-board-patch\.js/)
})
