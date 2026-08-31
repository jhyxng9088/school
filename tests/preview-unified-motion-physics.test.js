import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'
import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStationNavRefinementSource } from '../src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from '../src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from '../src/preview-nested-station-reaction-patch.js'
import { patchPreviewUnifiedMotionPhysicsSource } from '../src/preview-unified-motion-physics-patch.js'
import { patchPreviewUnifiedMotionSyntaxFixSource } from '../src/preview-unified-motion-syntax-fix-patch.js'

const rawMain = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const physicsModule = fs.readFileSync(new URL('../src/s-hub-motion-physics.js', import.meta.url), 'utf8')

function buildPreviewMain() {
  const id = '/src/main.jsx'
  let source = rawMain
  source = patchPreviewNavSpringSource(source, id)
  source = patchPreviewSHubV2Source(source, id)
  source = patchPreviewAIReminderSummarySource(source, id)
  source = patchPreviewReminderPolishSource(source, id)
  source = patchPreviewStationNavSource(source, id)
  source = patchPreviewStationNavRefinementSource(source, id)
  source = patchPreviewStationJellyMotionSource(source, id)
  source = patchPreviewNestedStationReactionSource(source, id)
  source = patchPreviewUnifiedMotionPhysicsSource(source, id)
  source = patchPreviewUnifiedMotionSyntaxFixSource(source, id)
  return source
}

const transformed = buildPreviewMain()

test('S-Hub preview has one canonical spring definition', () => {
  assert.match(physicsModule, /stiffness: 56/)
  assert.match(physicsModule, /damping: 10\.5/)
  assert.match(physicsModule, /mass: 1/)
  assert.match(physicsModule, /export function stepSHubSpring1D/)
  assert.match(physicsModule, /export function getSHubPillVisual/)
})

test('main, nested pill, and class layout all call the same physical integrator', () => {
  assert.match(transformed, /from '\.\/s-hub-motion-physics\.js'/)
  const calls = transformed.match(/stepSHubSpring1D\(/g) || []
  assert.equal(calls.length, 3)
  assert.doesNotMatch(transformed, /const stiffness = 56/)
  assert.doesNotMatch(transformed, /const damping = 10\.5/)
})

test('outer shell reaction is driven by the real nested pill frame, not a second spring', () => {
  assert.match(transformed, /shubminipillframe/)
  assert.match(transformed, /useClassNestedReactionFromMiniSpring/)
  assert.doesNotMatch(transformed, /function useClassNestedReactionSpring/)
})

test('class expand and exit are triggered by real spring state instead of millisecond guesses', () => {
  assert.match(transformed, /shubmainpillframe/)
  assert.match(transformed, /shubclasslayoutframe/)
  assert.match(transformed, /detail\.progress <= 0\.46/)
  assert.doesNotMatch(transformed, /setTimeout\(\(\) => setClassNavExpanded\(true\)/)
  assert.doesNotMatch(transformed, /classExitTimerRef\.current = window\.setTimeout/)
})

test('final transformed app has one AppShell boundary', () => {
  const appShells = transformed.match(/function AppShell\(\{ profile \}\) \{/g) || []
  assert.equal(appShells.length, 1)
})
