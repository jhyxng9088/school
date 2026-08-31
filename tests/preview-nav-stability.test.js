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
  return source
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

test('class entry has no timer-created empty capsule phase', () => {
  const source = buildFinalMain()
  assert.doesNotMatch(source, /setTimeout\(\(\) => setClassNavExpanded\(true\), 170\)/)
  assert.match(source, /if \(activeTab === 'class'\)[\s\S]*setClassNavExpanded\(true\)/)
})

test('class icon and nested controls crossfade from one spring progress without a blank interval', () => {
  const source = buildFinalMain()
  assert.match(source, /const overlayOpacity = Math\.max\(0, Math\.min\(1, \(classProgress - 0\.08\) \/ 0\.35\)\)/)
  assert.match(source, /const classReturnOpacity = 1 - overlayOpacity/)
  const css = patchPreviewNavStabilitySource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(css, /opacity: var\(--class-overlay-opacity, 0\) !important/)
  assert.match(css, /opacity: var\(--class-return-opacity, 1\) !important/)
  assert.match(css, /transition: none !important/)
})

test('legacy collapse guard no longer runs getComputedStyle every frame', () => {
  const source = buildFinalMain()
  const shell = block(source, 'function AppShell({ profile }) {', '  const aiContext = useMemo')
  assert.doesNotMatch(shell, /useClassCollapseSettledGuard\(/)
})

test('nested pill follows parent spring with analytic 5px geometry instead of frame rect reads', () => {
  const source = buildFinalMain()
  const nested = block(source, '    const syncWithParentStation = () => {', '\n\n    const handleResize = () => {')
  assert.match(nested, /const inset = 5/)
  assert.match(nested, /\(baseClassWidth - inset \* 2\) \/ 2/)
  assert.doesNotMatch(nested, /getBoundingClientRect/)
  assert.doesNotMatch(nested, /clientWidth/)
})

test('main stationlayout hot path uses inline grid geometry before any fallback layout read', () => {
  const source = buildFinalMain()
  const handler = block(source, '    const handleStationLayoutFrame = () => {', "\n    nav.addEventListener('stationlayout', handleStationLayoutFrame)")
  const inlineIndex = handler.indexOf("--station-class-actual")
  const rectIndex = handler.indexOf('getBoundingClientRect')
  assert.ok(inlineIndex >= 0)
  assert.ok(rectIndex > inlineIndex)
  assert.match(handler, /activeIndex >= 2/)
})

test('input path matches production pointerdown plus click without 700ms suppression bookkeeping', () => {
  const source = buildFinalMain()
  assert.doesNotMatch(source, /navTouchIntentRef/)
  assert.match(source, /if \(event\.pointerType !== 'mouse'\) changeTab\(tab\.id\)/)
  assert.match(source, /onClick=\{\(\) => changeTab\(tab\.id\)\}/)
})

test('class exit commits immediately and spring handoff only cleans collapse state', () => {
  const source = buildFinalMain()
  const change = block(source, '  function changeTab(nextTab) {', '\n\n  return (')
  assert.match(change, /setClassNavExpanded\(false\)[\s\S]*setClassNavCollapsing\(true\)[\s\S]*commitStationTab\(nextTab\)/)
  assert.doesNotMatch(change, /setTimeout/)
  const handoff = block(source, '    const handleClassExitHandoff = () => {', "\n\n    nav.addEventListener('classlayoutexithandoff', handleClassExitHandoff)")
  assert.match(handoff, /setClassNavCollapsing\(false\)/)
})

test('vite applies nav stability after responsiveness and all physical layers', () => {
  const vite = read('vite.config.js')
  const responsiveness = vite.indexOf('patchPreviewNavResponsivenessSource(next, cleanId)')
  const stability = vite.indexOf('patchPreviewNavStabilitySource(next, cleanId)')
  assert.ok(responsiveness >= 0)
  assert.ok(stability > responsiveness)
})
