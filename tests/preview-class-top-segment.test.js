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
import { patchPreviewClassTopSegmentSource, PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'

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
  source = patchPreviewClassTopSegmentSource(source, id)
  return source
}

test('class navigation is moved out of the bottom bar into a top segmented control', () => {
  const source = buildFinalMain()
  assert.match(source, /function ClassTopSegment\(\{ section, onSectionChange \}\)/)
  assert.match(source, /className="class-top-segment"/)
  assert.match(source, /aria-label="우리 반 메뉴"/)
  assert.doesNotMatch(source, /className=\{`class-nav-capsule/)
})

test('bottom nav no longer runs nested class geometry or class layout springs', () => {
  const source = buildFinalMain()
  assert.doesNotMatch(source, /const classMiniSpring = useStationLikePillSpring/)
  assert.doesNotMatch(source, /useClassStationLayoutSpring\(navRef, classNavExpanded\)/)
  assert.doesNotMatch(source, /useNestedGeometryCoupling\(navRef, classNavExpanded/)
  assert.doesNotMatch(source, /useClassCollapseSettledGuard\(navRef, classNavCollapsing/)
  assert.match(source, /className="bottom-nav"/)
})

test('leaving class uses the ordinary five-station change path with no collapse handoff', () => {
  const source = buildFinalMain()
  const start = source.indexOf('  function changeTab(nextTab) {')
  const end = source.indexOf('\n\n  return (', start)
  const block = source.slice(start, end)
  assert.match(block, /if \(nextTab === activeTabRef\.current\) return/)
  assert.match(block, /commitStationTab\(nextTab\)/)
  assert.doesNotMatch(block, /classNavCollapsing|classExitTargetRef|setTimeout/)
})

test('top segment uses the same canonical spring law as the bottom nav', () => {
  assert.deepEqual(PREVIEW_CLASS_SEGMENT_PHYSICS, {
    stiffness: 56,
    damping: 10.5,
    mass: 1,
    maxDt: 0.032,
    stretchPerVelocity: 0.032,
    maxStretch: 18,
    compressionVelocity: 18000,
    maxCompression: 0.028,
    radiusShrinkPerStretch: 0.08,
    settleDistancePx: 0.06,
    settleVelocityPx: 0.06,
  })
  const source = buildFinalMain()
  assert.match(source, /physics\.velocity \+= acceleration \* dt/)
  assert.match(source, /physics\.x \+= physics\.velocity \* dt/)
  assert.match(source, /const visualX = movingLeft \? physics\.x - stretch : physics\.x/)
})

test('top segment is thin and spans the class content width', () => {
  const styles = patchPreviewClassTopSegmentSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(styles, /\.class-top-segment \{[\s\S]*width: 100%;[\s\S]*height: 46px;/)
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.bottom-nav \{[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\) !important;/)
})

test('vite applies top segment replacement after the old nested preview layers', () => {
  const vite = read('vite.config.js')
  const responsive = vite.indexOf('patchPreviewNavResponsivenessSource(next, cleanId)')
  const topSegment = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  assert.ok(responsive >= 0)
  assert.ok(topSegment > responsive)
})
