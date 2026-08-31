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

test('middle class pill deformation is derived directly from nested pill stretch with no second reaction spring hook', () => {
  const source = buildFinalMain()
  assert.doesNotMatch(source, /useClassNestedReactionSpring\(navRef, classSection/)
  assert.match(source, /const physicalShift = .*leadingEnergy \* 0\.18/)
  assert.match(source, /--class-physical-shift-x/)
  assert.match(source, /--class-physical-scale-x/)
  assert.match(source, /--class-physical-origin-x/)
})

test('neighboring top-level stations are not independently pushed by the nested pill', () => {
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(css, /data-tab="home"[\s\S]*scaleX\(var\(--station-item-scale-x, 1\)\)/)
  assert.doesNotMatch(css, /data-tab="home"[\s\S]{0,200}--class-home-react-x/)
})

test('nested controls are generated only as the middle class pill physically opens', () => {
  const source = buildFinalMain()
  const css = patchPreviewPhysicalClassCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(source, /--class-progress/)
  assert.match(css, /opacity: clamp\(0, calc\(\(var\(--class-progress, 0\) - \.34\) \* 2\.2\), 1\)/)
})

test('nested pill returns the middle pill skin to neutral at physical settle', () => {
  const source = buildFinalMain()
  assert.match(source, /settledHost\.style\.setProperty\('--class-physical-shift-x', '0px'\)/)
  assert.match(source, /settledHost\.style\.setProperty\('--class-physical-scale-x', '1'\)/)
  assert.match(source, /settledHost\.style\.setProperty\('--class-physical-origin-x', '50%'\)/)
})
