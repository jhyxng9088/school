import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CLASS_SEGMENT_PHYSICS, patchPreviewClassTopSegmentSource } from '../src/preview-class-top-segment-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'
import { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared segment spring preserves the existing class physics values', () => {
  assert.deepEqual(S_HUB_SEGMENT_SPRING_PHYSICS, PREVIEW_CLASS_SEGMENT_PHYSICS)
})

test('class top-segment patch directly emits the canonical shared spring wrapper', () => {
  const page = patchPreviewClassTopSegmentSource(read('src/main.jsx'), '/workspace/src/main.jsx')
  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useClassTopSegmentSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--segment-padding'/)
  assert.match(page, /shellScaleProperty: '--segment-shell-scale-x'/)
  assert.match(page, /shellShiftProperty: '--segment-shell-shift-x'/)
  assert.match(page, /fallbackPadding: 5/)
  assert.match(page, /data-unread-key=\{item\.id\}/)
  assert.doesNotMatch(page, /const physicsRef = useRef\(\{/)
  assert.doesNotMatch(page, /const springForce = -56 \* displacement/)
})

test('study patch directly emits the canonical shared spring wrapper', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /shellScaleProperty: '--study-ranking-shell-scale-x'/)
  assert.match(page, /shellShiftProperty: '--study-ranking-shell-shift-x'/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const physicsRef = useRef\(\{/)
  assert.doesNotMatch(page, /const springForce = -56 \* displacement/)
})

test('schedule continues to reuse the class segment spring wrapper', () => {
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(schedulePatch, /function useScheduleTopSegmentSpring/)
})

test('the retired final shared-segment build owner is absent', () => {
  const vite = read('vite.config.js')
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
})
