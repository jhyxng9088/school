import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const patch = fs.readFileSync(new URL('../src/preview-station-jelly-motion-patch.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('top-level station tap is dispatched only once after layout motion', () => {
  assert.match(patch, /single station tap dispatch/)
  assert.match(patch, /onClick=\{\(\) => changeTab\(tab\.id\)\}/)
  assert.match(patch, /onPointerDown=\{\(event\) => \{\\n\s+if \(event\.pointerType !== 'mouse'\) changeTab\(tab\.id\)/)
})

test('nested pill reuses the exact main station spring physics and stretch math', () => {
  assert.match(patch, /const STATION_STIFFNESS = 56/)
  assert.match(patch, /const STATION_DAMPING = 10\.5/)
  assert.match(patch, /const STATION_MASS = 1/)
  assert.match(patch, /const stretch = Math\.min\(speed \* 0\.032, 18\)/)
  assert.match(patch, /const compression = Math\.min\(speed \/ 18000, 0\.028\)/)
  assert.match(patch, /function useStationLikePillSpring/)
  assert.doesNotMatch(patch, /@keyframes class-mini-jelly/)
})

test('class expansion itself is driven by the same spring instead of a CSS grid transition', () => {
  assert.match(patch, /function useClassStationLayoutSpring/)
  assert.match(patch, /grid-template-columns:/)
  assert.match(patch, /transition: none !important/)
  assert.match(patch, /nav\.dispatchEvent\(new Event\('stationlayout'\)\)/)
  assert.match(patch, /nav\.addEventListener\('stationlayout', handleStationLayoutFrame\)/)
})

test('nested selected label changes immediately and uses the same visible pill surface', () => {
  assert.match(patch, /background: var\(--surface\) !important/)
  assert.match(patch, /class-nav-subbutton\.is-active,/)
  assert.match(patch, /color: var\(--text\) !important/)
  assert.match(patch, /transition: none !important/)
})

test('class exit overlaps collapse with destination motion instead of waiting for collapse to finish', () => {
  assert.match(patch, /\}, 180\)/)
  assert.match(patch, /classExitReleaseTimerRef/)
  assert.match(patch, /\}, 500\)/)
})

test('preview vite applies station physics reuse after station refinement', () => {
  const refineIndex = vite.indexOf('patchPreviewStationNavRefinementSource(next, cleanId)')
  const jellyIndex = vite.indexOf('patchPreviewStationJellyMotionSource(next, cleanId)')
  assert.ok(refineIndex >= 0)
  assert.ok(jellyIndex > refineIndex)
})
