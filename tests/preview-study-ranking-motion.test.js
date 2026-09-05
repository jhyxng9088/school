import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study ranking reuses the class top-segment spring constants and stretch law', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\)/)
  assert.match(page, /useLayoutEffect/)
  assert.match(page, new RegExp(`const springForce = -${PREVIEW_CLASS_SEGMENT_PHYSICS.stiffness} \\* displacement`))
  assert.match(page, new RegExp(`const dampingForce = -${PREVIEW_CLASS_SEGMENT_PHYSICS.damping} \\* physics\\.velocity`))
  assert.match(page, new RegExp(`speed \\* ${PREVIEW_CLASS_SEGMENT_PHYSICS.stretchPerVelocity}, ${PREVIEW_CLASS_SEGMENT_PHYSICS.maxStretch}`))
  assert.match(page, /const visualX = movingLeft \? physics\.x - stretch : physics\.x/)
  assert.match(page, /--study-ranking-shell-scale-x/)
  assert.match(page, /--study-ranking-shell-shift-x/)
})

test('study ranking scope uses one physical pill with direct click ownership', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(page, /preview-study-ranking-pill/)
  assert.match(page, /ref=\{scopeSpring\.containerRef\}/)
  assert.match(page, /scopeSpring\.buttonRefs\.current\[0\]/)
  assert.match(page, /scopeSpring\.buttonRefs\.current\[1\]/)
  assert.match(page, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(page, /onClick=\{\(\) => selectScope\('school'\)\}/)
  assert.doesNotMatch(page, /onPointerDown=/)
  assert.doesNotMatch(page, /touchIntentRef/)
  assert.doesNotMatch(page, /performance\.now\(\) - intent\.at/)
})

test('study ranking content follows the selected direction with reduced-motion fallback', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  const style = patchPreviewStudySource(read('src/preview-study-ranking.css'), '/workspace/src/preview-study-ranking.css')

  assert.match(page, /setStageDirection\(nextScope === 'school' \? 'forward' : 'back'\)/)
  assert.match(page, /data-direction=\{stageDirection\}/)
  assert.match(style, /\.preview-study-ranking-tabs::before/)
  assert.match(style, /\.preview-study-ranking-pill/)
  assert.match(style, /preview-study-ranking-forward/)
  assert.match(style, /preview-study-ranking-back/)
  assert.match(style, /translate3d\(14px, 0, 0\)/)
  assert.match(style, /translate3d\(-14px, 0, 0\)/)
  assert.match(style, /prefers-reduced-motion: reduce/)
  assert.match(style, /preview-study-ranking-stage\[data-direction\][\s\S]*animation: none !important/)
})
