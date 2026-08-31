import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewCleanStationPhysicsSource } from '../src/preview-station-clean-physics-patch.js'
import { STATION_PHYSICS, stationPillVisual, stepStationSpring } from '../src/preview-station-physics-runtime.js'

const rawMain = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const cleanPatch = fs.readFileSync(new URL('../src/preview-station-clean-physics-patch.js', import.meta.url), 'utf8')
const runtime = fs.readFileSync(new URL('../src/preview-station-physics-runtime.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

function buildStationMain() {
  const id = '/src/main.jsx'
  let source = patchPreviewNavSpringSource(rawMain, id)
  source = patchPreviewStationNavSource(source, id)
  source = patchPreviewCleanStationPhysicsSource(source, id)
  return source
}

const transformed = buildStationMain()

test('one spring definition drives all physical station pills', () => {
  assert.deepEqual(
    { stiffness: STATION_PHYSICS.stiffness, damping: STATION_PHYSICS.damping, mass: STATION_PHYSICS.mass },
    { stiffness: 56, damping: 10.5, mass: 1 },
  )
  assert.match(transformed, /function useNavSpring\(activeIndex\) \{\s*return useElasticPillSpring\(activeIndex/)
  const sharedHookCalls = transformed.match(/useElasticPillSpring\(/g) || []
  assert.equal(sharedHookCalls.length, 2)
  assert.doesNotMatch(transformed, /function useStationLikePillSpring/)
  assert.doesNotMatch(transformed, /function useClassNestedReactionSpring/)
})

test('spring integration and velocity deformation remain the proven station equations', () => {
  const state = { value: 0, velocity: 0 }
  stepStationSpring(state, 100, 0.016)
  assert.ok(state.value > 0)
  assert.ok(state.velocity > 0)
  const visual = stationPillVisual(20, 120, 60)
  assert.equal(visual.stretch, Math.min(120 * 0.032, 18))
  assert.equal(visual.visualX, 20)
  assert.equal(visual.visualWidth, 60 + visual.stretch)
  assert.equal(visual.compression, Math.min(120 / 18000, 0.028))
})

test('nested pill pressure comes only from real visual boundary overlap', () => {
  assert.match(runtime, /leftPressure = Math\.max\(0, padding - visual\.visualX\)/)
  assert.match(runtime, /rightPressure = Math\.max\(0, visual\.visualRight - \(container\.clientWidth - padding\)\)/)
  assert.match(runtime, /physics\.targetWidth = physics\.engaged \? physics\.openWidth \+ pressure : physics\.closedWidth/)
  assert.doesNotMatch(runtime, /homePush|aiPush|studyPush|schedulePush/)
  assert.doesNotMatch(runtime, /impulse \*/)
})

test('neighbor station buttons move by real grid geometry, never imitation transforms', () => {
  assert.match(cleanPatch, /grid-template-columns:\s*var\(--station-side-current\)\s*var\(--station-class-current\)/)
  assert.match(cleanPatch, /\.bottom-nav\.clean-station-physics \.nav-button \{[\s\S]*transform: none !important/)
  assert.match(runtime, /const sideWidth = Math\.max\(0, \(physics\.innerWidth - width\) \/ 4\)/)
  assert.match(runtime, /--station-side-current/)
  assert.match(runtime, /nav\.dispatchEvent\(new Event\('stationgeometry'\)\)/)
})

test('the original main indicator itself remains the visible outer class pill', () => {
  assert.match(cleanPatch, /\.bottom-nav\.clean-station-physics\[data-class-engaged="true"\] \.nav-indicator/)
  assert.match(cleanPatch, /\.class-nav-capsule,[\s\S]*background: transparent !important/)
  assert.match(cleanPatch, /\.class-nav-capsule,[\s\S]*box-shadow: none !important/)
  assert.doesNotMatch(cleanPatch, /class-nav-capsule[\s\S]*background: var\(--surface-glass\) !important/)
})

test('class expansion waits for actual main-pill settling and has no millisecond choreography', () => {
  assert.match(runtime, /detail\.activeIndex !== 1 \|\| !detail\.settled \|\| physics\.engaged/)
  assert.match(runtime, /nav\.addEventListener\('mainpillframe', handleMainFrame\)/)
  assert.doesNotMatch(transformed, /setTimeout\(\(\) => setClassNavExpanded/)
  assert.doesNotMatch(transformed, /classExitTimerRef/)
  assert.doesNotMatch(transformed, /classNavCollapsing/)
})

test('nested pill is visible and active label color updates immediately', () => {
  assert.match(cleanPatch, /\.class-nav-mini-pill,[\s\S]*background: var\(--surface\) !important/)
  assert.match(cleanPatch, /\.class-nav-subbutton\.is-active,[\s\S]*color: var\(--text\) !important/)
  assert.match(cleanPatch, /\.class-nav-subbutton,[\s\S]*transition: none !important/)
})

test('visual hit target and button identity stay aligned after grid motion', () => {
  assert.doesNotMatch(transformed, /onPointerDown=\{\(event\) =>/)
  assert.match(transformed, /onClick=\{\(\) => changeTab\(tab\.id\)\}/)
  assert.match(cleanPatch, /transform: none !important/)
})

test('vite has exactly one station motion pass after the structural station patch', () => {
  const structural = vite.indexOf('patchPreviewStationNavSource(next, cleanId)')
  const clean = vite.indexOf('patchPreviewCleanStationPhysicsSource(next, cleanId)')
  assert.ok(structural >= 0)
  assert.ok(clean > structural)
  assert.doesNotMatch(vite, /patchPreviewStationNavRefinementSource/)
  assert.doesNotMatch(vite, /patchPreviewStationJellyMotionSource/)
  assert.doesNotMatch(vite, /patchPreviewNestedStationReactionSource/)
})
