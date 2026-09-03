import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'
import { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'
import { patchSharedSegmentSpringOwnerSource } from '../src/shared-segment-spring-owner-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared segment spring preserves the existing class physics values', () => {
  assert.deepEqual(S_HUB_SEGMENT_SPRING_PHYSICS, PREVIEW_CLASS_SEGMENT_PHYSICS)
})

test('final motion ownership replaces the generated class spring with a shared hook wrapper', () => {
  const source = `import React, { useLayoutEffect } from 'react'\nfunction useClassTopSegmentSpring(activeIndex) {\n  const duplicated = true\n  return duplicated\n}\n\nfunction ClassTopSegment({ section, onSectionChange }) {\n  return null\n}\n`
  const next = patchSharedSegmentSpringOwnerSource(source, '/workspace/src/main.jsx')
  assert.match(next, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(next, /function useClassTopSegmentSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.doesNotMatch(next, /const duplicated = true/)
  assert.match(next, /paddingProperty: '--segment-padding'/)
})

test('class spring migration survives downstream ClassTopSegment prop changes', () => {
  const source = `import React, { useLayoutEffect } from 'react'\nfunction useClassTopSegmentSpring(activeIndex) {\n  const duplicated = true\n  return duplicated\n}\n\nfunction ClassTopSegment({ section, onSectionChange, unread, touchIntentRef }) {\n  return null\n}\n`
  const next = patchSharedSegmentSpringOwnerSource(source, '/workspace/src/main.jsx')
  assert.match(next, /return useSHubSegmentSpring/)
  assert.match(next, /function ClassTopSegment\(\{ section, onSectionChange, unread, touchIntentRef \}\)/)
})

test('final motion ownership replaces the generated study spring with the same shared hook', () => {
  const source = `import React, { useLayoutEffect } from 'react'\nfunction useStudyRankingScopeSpring(activeIndex) {\n  const duplicated = true\n  return duplicated\n}\n\nfunction StudyRanking({ scope }) {\n  return scope\n}\n`
  const next = patchSharedSegmentSpringOwnerSource(source, '/workspace/src/preview-study.jsx')
  assert.match(next, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(next, /function useStudyRankingScopeSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.doesNotMatch(next, /const duplicated = true/)
  assert.match(next, /paddingProperty: '--study-ranking-padding'/)
  assert.match(next, /fallbackPadding: 4/)
})

test('final motion ownership is a no-op when an upstream segment patch is intentionally absent', () => {
  const source = `import React from 'react'\nfunction Icon() { return null }\n`
  assert.equal(
    patchSharedSegmentSpringOwnerSource(source, '/workspace/src/main.jsx'),
    source,
  )
  assert.equal(
    patchSharedSegmentSpringOwnerSource(source, '/workspace/src/preview-study.jsx'),
    source,
  )
})

test('schedule continues to reuse the class segment spring wrapper', () => {
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(schedulePatch, /function useScheduleTopSegmentSpring/)
})

test('the existing final ownership transform delegates segment spring migration without adding another Vite transform', () => {
  const owner = read('src/shared-icon-owner-patch.js')
  const vite = read('vite.config.js')
  assert.match(owner, /patchSharedSegmentSpringOwnerSource/)
  assert.equal((vite.match(/patchSharedIconOwnerSource\(next, cleanId\)/g) || []).length, 1)
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource\(next, cleanId\)/)
})
