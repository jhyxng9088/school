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
  assert.match(source, /rightExtension = Math\.max\(0, visualRight - \(capsuleWidth - inset\)\)/)
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

test('outer class pill follows actual geometry directly while coupled so nested and outer pills cannot lag into overlap', () => {
  const source = buildFinalMain()
  assert.match(source, /nav\.dataset\.nestedGeometryFollow === 'true' && activeIndex === 1/)
  assert.match(source, /physics\.x = physics\.targetX/)
  assert.match(source, /physics\.velocity = 0/)
  assert.match(source, /syncOuterIndicatorNow/)
  assert.match(source, /buttonRect\.width \+ 'px'/)
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
