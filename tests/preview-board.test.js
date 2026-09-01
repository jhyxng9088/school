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
  assert.match(source, /function PreviewBoardPage\(\) \{\s*return <PreviewBoard \/>/)
  assert.doesNotMatch(source, /게시판 자리까지 먼저 연결/)
})

test('class timetable and board content use keyed directional transition panels', () => {
  const source = buildBoardMain()
  assert.match(source, /key=\{section\}/)
  assert.match(source, /class-station-panel/)
  assert.match(source, /section === 'board' \? 'is-board' : 'is-timetable'/)
})

test('board API client authenticates and uses the isolated preview board resource', () => {
  const source = read('src/preview-board-client.js')
  assert.match(source, /ensureSignedIn/)
  assert.match(source, /getIdToken/)
  assert.match(source, /authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /resource: 'board'/)
  assert.match(source, /\?resource=board/)
  assert.doesNotMatch(source, /mock|fixture|seedPosts/i)
})

test('board UI covers writes, comments, resolve, offline and server limits', () => {
  const source = read('src/preview-board.jsx')
  assert.match(source, /createPreviewBoardPost/)
  assert.match(source, /addPreviewBoardComment/)
  assert.match(source, /resolvePreviewBoardQuestion/)
  assert.match(source, /maxLength=\{70\}/)
  assert.match(source, /maxLength=\{1200\}/)
  assert.match(source, /maxLength=\{500\}/)
  assert.match(source, /navigator\.onLine/)
  assert.match(source, /UnifiedBottomSheet/)
  assert.match(source, /window\.addEventListener\('online', revalidate\)/)
})

test('board motion remains mobile and accessibility safe', () => {
  const css = read('src/preview-board.css')
  assert.match(css, /\.class-station-panel\.is-board[\s\S]*--class-panel-enter-x: 14px/)
  assert.match(css, /\.class-station-panel\.is-timetable[\s\S]*--class-panel-enter-x: -14px/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /html\.school-samsung/)
  assert.match(css, /@media \(max-width: 430px\)/)
})

test('vite runs board wiring after the class top segment replacement', () => {
  const vite = read('vite.config.js')
  const classSegment = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const board = vite.indexOf('patchPreviewBoardSource(next, cleanId)')
  assert.ok(classSegment >= 0)
  assert.ok(board > classSegment)
  assert.match(vite, /preview-board-patch\.js/)
})
