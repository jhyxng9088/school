import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStationNavRefinementSource } from '../src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from '../src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from '../src/preview-nested-station-reaction-patch.js'
import { patchPreviewUnifiedStationPhysicsSource } from '../src/preview-unified-station-physics-patch.js'
import { patchPreviewPhysicalClassCouplingSource } from '../src/preview-physical-class-coupling-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function buildFinalMain() {
  let source = read('src/main.jsx')
  const id = '/workspace/src/main.jsx'
  source = patchPreviewNavSpringSource(source, id)
  source = patchPreviewStationNavSource(source, id)
  source = patchPreviewStationNavRefinementSource(source, id)
  source = patchPreviewStationJellyMotionSource(source, id)
  source = patchPreviewNestedStationReactionSource(source, id)
  source = patchPreviewUnifiedStationPhysicsSource(source, id)
  source = patchPreviewPhysicalClassCouplingSource(source, id)
  return source
}

test('the real top-level nav indicator stays visible and becomes the expanded class pill', () => {
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(css, /is-class-expanded \.nav-indicator,[\s\S]*opacity: 1 !important/)
  assert.match(css, /\.nav-indicator::after[\s\S]*background: var\(--surface-glass\)/)
  assert.match(css, /\.class-nav-capsule[\s\S]*background: transparent !important/)
  assert.match(css, /\.class-nav-capsule[\s\S]*box-shadow: none !important/)
})

test('nested pill emits its real frame geometry and velocity into the same station host', () => {
  const source = buildFinalMain()
  assert.match(source, /new CustomEvent\('classminiphysics'/)
  assert.match(source, /velocity: physics\.velocity/)
  assert.match(source, /visualX,/)
  assert.match(source, /visualWidth,/)
  assert.match(source, /stretch,/)
})

test('middle class pill is visibly pushed from the real nested pill frame with no second reaction spring hook', () => {
  const source = buildFinalMain()
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.doesNotMatch(source, /useClassNestedReactionSpring\(navRef, classSection/)
  assert.match(source, /const physicalShift = .*leadingEnergy \* 0\.36/)
  assert.match(source, /const contentShift = physicalShift \* 0\.34/)
  assert.match(source, /--class-physical-shift-x/)
  assert.match(source, /--class-physical-content-shift-x/)
  assert.match(source, /--class-physical-scale-x/)
  assert.match(source, /--class-physical-origin-x/)
  assert.match(css, /translate3d\(calc\(-50% \+ var\(--class-physical-content-shift-x, 0px\)\)/)
})

test('smallest pill continuously remeasures the opening class station instead of keeping its first narrow width', () => {
  const source = buildFinalMain()
  assert.match(source, /const syncWithParentStation = \(\) =>/)
  assert.match(source, /stationHost\?\.addEventListener\('stationlayout', syncWithParentStation\)/)
  assert.match(source, /physics\.baseWidth = buttonRect\.width/)
  assert.match(source, /Width is geometry, not a second animation/)
  assert.match(source, /stationHost\?\.removeEventListener\('stationlayout', syncWithParentStation\)/)
})

test('neighboring top-level stations are not independently pushed by the nested pill', () => {
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(css, /data-tab="home"[\s\S]*scaleX\(var\(--station-item-scale-x, 1\)\)/)
  assert.doesNotMatch(css, /data-tab="home"[\s\S]{0,200}--class-home-react-x/)
})

test('nested controls are generated only as the middle class pill physically opens', () => {
  const source = buildFinalMain()
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(source, /const classProgress = Math\.max\(0, Math\.min\(1, physics\.progress\)\)/)
  assert.match(source, /const overlayOpacity = Math\.max\(0, Math\.min\(1, \(classProgress - 0\.34\) \/ 0\.45\)\)/)
  assert.match(source, /--class-overlay-opacity/)
  assert.match(css, /opacity: var\(--class-overlay-opacity, 0\) !important/)
})

test('class icon returns from real collapse progress with no fixed visual dead gap', () => {
  const source = buildFinalMain()
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(source, /const classReturnOpacity = Math\.max\(0, Math\.min\(1, \(0\.38 - classProgress\) \/ 0\.26\)\)/)
  assert.match(source, /--class-return-opacity/)
  assert.match(css, /is-class-collapsing \.nav-button\[data-tab="class"\][\s\S]*opacity: var\(--class-return-opacity, 0\) !important/)
})

test('class exit handoff is driven by collapse spring progress instead of the old 180ms plus 500ms timers', () => {
  const source = buildFinalMain()
  assert.match(source, /physics\.target === 0 && !physics\.exitHandoffSent && physics\.progress <= 0\.18/)
  assert.match(source, /new CustomEvent\('classlayoutexithandoff'/)
  assert.match(source, /nav\.addEventListener\('classlayoutexithandoff', handleClassExitHandoff\)/)
  assert.match(source, /commitStationTab\(target\)/)
  assert.doesNotMatch(source, /\}, 500\)\n      \}, 180\)/)
})

test('nested pill returns the middle pill skin to neutral at physical settle and cleanup', () => {
  const source = buildFinalMain()
  assert.match(source, /settledHost\.style\.setProperty\('--class-physical-shift-x', '0px'\)/)
  assert.match(source, /settledHost\.style\.setProperty\('--class-physical-content-shift-x', '0px'\)/)
  assert.match(source, /settledHost\.style\.setProperty\('--class-physical-scale-x', '1'\)/)
  assert.match(source, /stationHost\.style\.setProperty\('--class-physical-origin-x', '50%'\)/)
})
