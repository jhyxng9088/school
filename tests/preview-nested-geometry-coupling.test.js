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
  return source
}

test('nested station reuses the exact 5px main-shell inset', () => {
  const baseCss = read('src/styles.css')
  const finalCss = patchPreviewNestedGeometryCouplingSource(baseCss, '/workspace/src/styles.css')
  assert.match(baseCss, /--nav-padding: 5px/)
  assert.match(finalCss, /padding: 5px !important/)
  assert.match(finalCss, /top: 5px !important/)
  assert.match(finalCss, /bottom: 5px !important/)
  assert.match(buildFinalMain(), /const inset = 5/)
})

test('small pill pressure changes real class grid geometry instead of a decorative transform', () => {
  const source = buildFinalMain()
  const finalCss = patchPreviewNestedGeometryCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(source, /leftExtension = Math\.max\(0, inset - visualX\)/)
  assert.match(source, /rightExtension = Math\.max\(0, visualRight - \(baseClassWidth - inset\)\)/)
  assert.match(source, /actualClassWidth = baseClassWidth \+ leftExtension \+ rightExtension/)
  assert.match(source, /actualLeftWidth = Math\.max\(0, baseSideWidth - leftExtension\)/)
  assert.match(source, /actualRightWidth = Math\.max\(0, baseSideWidth - rightExtension \/ 3\)/)
  assert.match(finalCss, /var\(--station-left-actual/)
  assert.match(finalCss, /var\(--station-class-actual/)
  assert.match(finalCss, /var\(--station-right-actual/)
})

test('nested target geometry stays baseline while only the visible class shell temporarily grows', () => {
  const finalCss = patchPreviewNestedGeometryCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(finalCss, /\.class-nav-capsule[\s\S]*width: var\(--station-class-current\) !important/)
  assert.match(finalCss, /\.class-nav-capsule[\s\S]*left: var\(--class-capsule-center\) !important/)
  assert.match(finalCss, /overflow: visible !important/)
})

test('nested geometry uses cached inline station values and never recursively dispatches stationlayout', () => {
  const patch = read('src/preview-nested-geometry-coupling-patch.js')
  assert.match(patch, /nav\.style\.getPropertyValue\('--station-class-current'\)/)
  assert.match(patch, /nav\.style\.getPropertyValue\('--station-side-current'\)/)
  assert.doesNotMatch(patch, /window\.getComputedStyle\(nav\)/)
  assert.doesNotMatch(patch, /capsule\.clientWidth/)
  assert.doesNotMatch(patch, /scheduleLayoutSync/)
  assert.doesNotMatch(patch, /nav\.dispatchEvent\(new Event\('stationlayout'\)\)/)
})

test('outer class pill follows actual geometry directly only while class owns the indicator', () => {
  const source = buildFinalMain()
  assert.match(source, /useNestedGeometryCoupling\(navRef, classNavExpanded \|\| classNavCollapsing, activeTab === 'class'\)/)
  assert.match(source, /function syncOuterIndicatorNow\(actualLeftWidth, actualClassWidth\)/)
  assert.match(source, /if \(!ownsIndicator\) return/)
  assert.match(source, /const x = inset \+ actualLeftWidth/)
  assert.match(source, /physics\.targetX = 5 \+ leftWidth/)
  assert.match(source, /physics\.baseWidth = classWidth/)
})

test('nested pill follows parent class spring without per-frame DOM geometry reads', () => {
  const source = buildFinalMain()
  const start = source.indexOf('    const syncWithParentStation = () => {')
  const end = source.indexOf('    const handleResize = () => {', start)
  assert.ok(start >= 0)
  assert.ok(end > start)
  const syncBlock = source.slice(start, end)

  assert.match(syncBlock, /stationHost\?\.style\.getPropertyValue\('--station-class-current'\)/)
  assert.match(syncBlock, /const slotWidth = Math\.max\(0, \(stationClassWidth - inset \* 2\) \/ 2\)/)
  assert.match(syncBlock, /physics\.targetX = inset \+ slotWidth \* activeIndex/)
  assert.match(syncBlock, /physics\.baseWidth = slotWidth/)
  assert.doesNotMatch(syncBlock, /getBoundingClientRect\(/)
})

test('old decorative middle-shell transform is neutralized in the final geometry layer', () => {
  const finalCss = patchPreviewNestedGeometryCouplingSource(read('src/styles.css'), '/workspace/src/styles.css')
  assert.match(finalCss, /data-nested-geometry-follow="true"[\s\S]*\.nav-indicator::after[\s\S]*transform: none !important/)
})

test('vite applies nested geometry coupling after the previous physical class layer', () => {
  const vite = read('vite.config.js')
  const physical = vite.indexOf('patchPreviewPhysicalClassCouplingSource(next, cleanId)')
  const geometry = vite.indexOf('patchPreviewNestedGeometryCouplingSource(next, cleanId)')
  assert.ok(physical >= 0)
  assert.ok(geometry > physical)
})
