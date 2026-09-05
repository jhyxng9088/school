import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study ranking directly reuses the canonical shared segment spring', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\)/)
  assert.match(page, /return useSHubSegmentSpring\(activeIndex/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /--study-ranking-shell-scale-x/)
  assert.match(page, /--study-ranking-shell-shift-x/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const physicsRef = useRef\(\{/)
  assert.doesNotMatch(page, /const springForce = -/)
  assert.doesNotMatch(page, /useLayoutEffect/)
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
