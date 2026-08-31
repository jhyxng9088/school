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
  return source
}

function changeTabBlock(source) {
  const start = source.indexOf('  function changeTab(nextTab) {')
  const end = source.indexOf('\n\n  return (', start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

test('touch navigation fires on pointer down and suppresses only its synthetic click', () => {
  const source = buildFinalMain()
  assert.match(source, /const navTouchIntentRef = useRef\(\{ key: '', at: 0 \}\)/)
  assert.match(source, /onPointerDown=\{\(event\) => \{\n\s+if \(event\.pointerType === 'mouse'\) return/)
  assert.match(source, /navTouchIntentRef\.current = \{ key: tab\.id, at: performance\.now\(\) \}/)
  assert.match(source, /performance\.now\(\) - intent\.at < 700/)
})

test('nested timetable and board taps use the same immediate touch path', () => {
  const source = buildFinalMain()
  assert.match(source, /key: 'class:timetable', at: performance\.now\(\)/)
  assert.match(source, /key: 'class:board', at: performance\.now\(\)/)
  assert.match(source, /setClassSection\('timetable'\)/)
  assert.match(source, /setClassSection\('board'\)/)
})

test('leaving class commits the destination immediately while collapse continues in parallel', () => {
  const block = changeTabBlock(buildFinalMain())
  assert.match(block, /activeTabRef\.current === 'class'/)
  assert.match(block, /classExitTargetRef\.current = ''/)
  assert.match(block, /setClassNavExpanded\(false\)[\s\S]*setClassNavCollapsing\(true\)[\s\S]*commitStationTab\(nextTab\)/)
  assert.doesNotMatch(block, /window\.setTimeout/)
})

test('tapping class during an in-flight collapse reverses immediately instead of waiting', () => {
  const block = changeTabBlock(buildFinalMain())
  assert.match(block, /if \(nextTab === 'class' && classNavCollapsing\)/)
  assert.match(block, /setClassNavCollapsing\(false\)[\s\S]*setClassNavExpanded\(true\)[\s\S]*commitStationTab\(nextTab\)/)
})

test('normal class exit no longer leaves a pending handoff target that can block later taps', () => {
  const block = changeTabBlock(buildFinalMain())
  const classExit = block.slice(block.indexOf("if (activeTabRef.current === 'class'"))
  assert.match(classExit, /classExitTargetRef\.current = ''/)
  assert.doesNotMatch(classExit, /classExitTargetRef\.current = nextTab/)
})

test('nested geometry no longer creates a stationlayout feedback loop during inner-pill motion', () => {
  const patch = read('src/preview-nested-geometry-coupling-patch.js')
  assert.doesNotMatch(patch, /scheduleLayoutSync/)
  assert.doesNotMatch(patch, /nav\.dispatchEvent\(new Event\('stationlayout'\)\)/)
  assert.doesNotMatch(patch, /window\.getComputedStyle\(nav\)/)
  assert.doesNotMatch(patch, /capsule\.clientWidth/)
})

test('vite applies responsiveness last after nested physical geometry', () => {
  const vite = read('vite.config.js')
  const geometry = vite.indexOf('patchPreviewNestedGeometryCouplingSource(next, cleanId)')
  const responsive = vite.indexOf('patchPreviewNavResponsivenessSource(next, cleanId)')
  assert.ok(geometry >= 0)
  assert.ok(responsive > geometry)
})
