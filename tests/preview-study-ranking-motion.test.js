import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study ranking emits the canonical shared segment spring wrapper directly', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /shellScaleProperty: '--study-ranking-shell-scale-x'/)
  assert.match(page, /shellShiftProperty: '--study-ranking-shell-shift-x'/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const springForce =/)
  assert.doesNotMatch(page, /physics\.velocity \+=/)
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

test('study ranking content reuses the meal content motion with a visibly perceptible Study mapping and reduced-motion fallback', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  const style = patchPreviewStudySource(read('src/preview-study-ranking.css'), '/workspace/src/preview-study-ranking.css')
  const stage3 = read('src/stage3.css')
  const main = read('src/main.jsx')

  assert.match(page, /setStageDirection\(nextScope === 'school' \? 'forward' : 'back'\)/)
  assert.match(page, /data-direction=\{stageDirection\}/)
  assert.match(style, /\.preview-study-ranking-tabs::before/)
  assert.match(style, /\.preview-study-ranking-pill/)
  assert.match(style, /animation: stage3-detail-in 760ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both/)
  assert.match(style, /\.preview-study-ranking-stage\s*\{[\s\S]*animation-duration: 580ms/)
  assert.match(style, /data-direction="forward"[\s\S]*--stage3-direction: 2\.4/)
  assert.match(style, /data-direction="back"[\s\S]*--stage3-direction: -2\.4/)
  assert.match(stage3, /@keyframes stage3-detail-in/)
  assert.match(stage3, /translate3d\(calc\(var\(--stage3-direction, 1\) \* 9px\), 2px, 0\)/)
  assert.match(main, /import '\.\/stage3\.css'/)
  assert.doesNotMatch(style, /@keyframes preview-study-ranking-swap/)
  assert.doesNotMatch(style, /@keyframes preview-study-ranking-forward/)
  assert.doesNotMatch(style, /@keyframes preview-study-ranking-back/)
  assert.match(style, /prefers-reduced-motion: reduce/)
  assert.match(style, /preview-study-ranking-stage\[data-direction\][\s\S]*animation: none !important/)
})

test('late-loaded school refinements do not globally suppress Study motion', () => {
  const refinements = read('public/school-refinements.css')

  assert.doesNotMatch(
    refinements,
    /\.preview-study-ranking-stage\[data-direction\][\s\S]*?animation:\s*none\s*!important/,
  )
  assert.doesNotMatch(
    refinements,
    /\.preview-study-ranking-stage\s+\.preview-study-today-person[\s\S]*?animation:\s*none\s*!important/,
  )
})
