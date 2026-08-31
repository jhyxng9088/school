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
import { patchPreviewNestedGeometryCouplingSource } from '../src/preview-nested-geometry-coupling-patch.js'
import { patchPreviewNavResponsivenessSource } from '../src/preview-nav-responsiveness-patch.js'
import { patchPreviewNavStabilitySource } from '../src/preview-nav-stability-patch.js'
import { patchPreviewNavRealMotionSource } from '../src/preview-nav-real-motion-patch.js'

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
  source = patchPreviewNestedGeometryCouplingSource(source, id)
  source = patchPreviewNavResponsivenessSource(source, id)
  source = patchPreviewNavStabilitySource(source, id)
  source = patchPreviewNavRealMotionSource(source, id)
  return source
}

test('main pill publishes its actual spring frame for nested class controls', () => {
  const source = buildFinalMain()
  assert.match(source, /--main-pill-visual-x/)
  assert.match(source, /--main-pill-visual-width/)
  assert.match(source, /--main-pill-visual-center-x/)
})

test('class destination no longer snaps the main pill directly to targetX', () => {
  const source = buildFinalMain()
  assert.doesNotMatch(source, /directClassOwner/)
  assert.doesNotMatch(source, /if \(directClassOwner \|\| reduceMotion\)/)
  assert.match(source, /physics\.velocity \+= acceleration \* dt/)
  assert.match(source, /physics\.x \+= physics\.velocity \* dt/)
})

test('nested geometry cannot directly overwrite the main indicator transform', () => {
  const source = buildFinalMain()
  assert.doesNotMatch(source, /syncOuterIndicatorNow\(actualLeftWidth, actualClassWidth\)/)
  assert.match(source, /Main indicator paint is owned exclusively by useNavSpring/)
})

test('class controls are attached to the current visual main pill frame', () => {
  const css = patchPreviewNavRealMotionSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(css, /left: var\(--main-pill-visual-center-x/)
  assert.match(css, /width: var\(--main-pill-visual-width/)
  assert.match(css, /transform: translate3d\(-50%, 0, 0\) !important/)
})

test('smallest pill target follows the moving outer pill width instead of a parked destination capsule', () => {
  const source = buildFinalMain()
  assert.match(source, /const visualOuterWidth = Number\.parseFloat\(stationHost\?\.style\.getPropertyValue\('--main-pill-visual-width'\)\)/)
  assert.match(source, /Number\.isFinite\(visualOuterWidth\) && visualOuterWidth > 10 \? visualOuterWidth : targetClassWidth/)
})

test('vite applies real nav motion last', () => {
  const vite = read('vite.config.js')
  const stability = vite.indexOf('patchPreviewNavStabilitySource(next, cleanId)')
  const realMotion = vite.indexOf('patchPreviewNavRealMotionSource(next, cleanId)')
  assert.ok(stability >= 0)
  assert.ok(realMotion > stability)
})
