import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStationNavRefinementSource } from '../src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from '../src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from '../src/preview-nested-station-reaction-patch.js'
import {
  UNIVERSAL_STATION_PHYSICS,
  patchPreviewUnifiedStationPhysicsSource,
} from '../src/preview-unified-station-physics-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function buildStationMain() {
  let source = read('src/main.jsx')
  const id = '/workspace/src/main.jsx'
  source = patchPreviewNavSpringSource(source, id)
  source = patchPreviewStationNavSource(source, id)
  source = patchPreviewStationNavRefinementSource(source, id)
  source = patchPreviewStationJellyMotionSource(source, id)
  source = patchPreviewNestedStationReactionSource(source, id)
  return patchPreviewUnifiedStationPhysicsSource(source, id)
}

test('one canonical motion profile preserves the proven largest-pill tuning', () => {
  assert.deepEqual(UNIVERSAL_STATION_PHYSICS, {
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
    settleDistanceNormalized: 0.0008,
    settleVelocityNormalized: 0.0008,
  })
})

test('largest pill, nested pill, class expansion and nested reaction all read the same spring constants', () => {
  const source = buildStationMain()
  assert.match(source, /const S_HUB_STATION_PHYSICS = Object\.freeze/)
  assert.equal((source.match(/const stiffness = S_HUB_STATION_PHYSICS\.stiffness/g) || []).length, 4)
  assert.equal((source.match(/const damping = S_HUB_STATION_PHYSICS\.damping/g) || []).length, 4)
  assert.equal((source.match(/const mass = S_HUB_STATION_PHYSICS\.mass/g) || []).length, 4)
})

test('pill deformation is shared while each pill keeps its own geometry and radius', () => {
  const source = buildStationMain()
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.stretchPerVelocity/g) || []).length, 3)
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.maxStretch/g) || []).length, 3)
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.compressionVelocity/g) || []).length, 3)
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.maxCompression/g) || []).length, 3)
  assert.match(source, /Math\.max\(16, 20 - stretch \* S_HUB_STATION_PHYSICS\.radiusShrinkPerStretch\)/)
  assert.match(source, /Math\.max\(12, 16 - stretch \* S_HUB_STATION_PHYSICS\.radiusShrinkPerStretch\)/)
})

test('pixel pills and normalized station layouts use scale-appropriate settle thresholds from the same contract', () => {
  const source = buildStationMain()
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.settleDistancePx/g) || []).length, 2)
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.settleVelocityPx/g) || []).length, 2)
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.settleDistanceNormalized/g) || []).length, 2)
  assert.equal((source.match(/S_HUB_STATION_PHYSICS\.settleVelocityNormalized/g) || []).length, 2)
})

test('Vite applies the universal contract last so later station layers cannot silently drift', () => {
  const vite = read('vite.config.js')
  const nested = vite.indexOf('patchPreviewNestedStationReactionSource(next, cleanId)')
  const unified = vite.indexOf('patchPreviewUnifiedStationPhysicsSource(next, cleanId)')
  assert.ok(nested >= 0)
  assert.ok(unified > nested)
  assert.match(vite, /preview-unified-station-physics-patch\.js/)
})
