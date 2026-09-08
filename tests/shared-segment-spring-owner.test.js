import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'
import { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preview segment generators share the canonical spring physics object', () => {
  assert.equal(PREVIEW_CLASS_SEGMENT_PHYSICS, S_HUB_SEGMENT_SPRING_PHYSICS)
})

test('class segment generator owns the shared spring wrapper and unread semantic key directly', () => {
  const source = read('src/preview-class-top-segment-patch.js')
  assert.match(source, /import \{ S_HUB_SEGMENT_SPRING_PHYSICS \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(source, /return useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(source, /paddingProperty: '--segment-padding'/)
  assert.match(source, /data-unread-key=\{item\.id\}/)
  assert.doesNotMatch(source, /physics\.velocity \+= acceleration \* dt/)
})

test('Study raw source reuses the same shared spring wrapper without a duplicate physics runtime', () => {
  const page = read('src/preview-study.jsx')
  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const springForce =/)
  assert.doesNotMatch(page, /physics\.velocity \+=/)
})

test('schedule continues to reuse the class segment spring wrapper', () => {
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(schedulePatch, /function useScheduleTopSegmentSpring/)
})

test('late shared segment build owner is fully retired from Vite', () => {
  const vite = read('vite.config.js')
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
})
