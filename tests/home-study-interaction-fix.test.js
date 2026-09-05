import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home cards use semantic V2 destinations through the shared navigation owner', () => {
  const legacy = read('public/school-home-nav.js')
  const meal = read('src/home-meal-preview.jsx')
  const action = read('src/home-nav-action.jsx')

  assert.doesNotMatch(legacy, /navIndex/)
  assert.match(legacy, /\.current-class-card/)
  assert.match(legacy, /\.todo-home-preview/)
  assert.match(legacy, /\.academic-preview/)
  assert.doesNotMatch(legacy, /\.meal-preview/)
  assert.doesNotMatch(legacy, /section: 'meal'/)
  assert.match(legacy, /\.period-strip, \.today-timetable-empty/)
  assert.match(legacy, /SHubNavigation\?\.navigate\(route\)/)
  assert.doesNotMatch(legacy, /\.bottom-nav \.nav-button/)
  assert.doesNotMatch(legacy, /afterReactCommit/)
  assert.doesNotMatch(legacy, /station-schedule-switcher/)

  assert.match(meal, /<HomeNavAction tab="schedule" section="meal" label="급식 열기" \/>/)
  assert.match(action, /window\.SHubNavigation\?\.navigate\(\{ tab, section \}\)/)
})

test('study ranking keeps the existing scroll-stability rules without runtime style injection', () => {
  const source = read('public/school-home-nav.js')
  const refinements = read('public/school-refinements.css')
  const studyPatch = read('src/preview-study-patch.js')
  const recovery = read('src/production-recovery-patch.js')

  assert.doesNotMatch(source, /pointerType === 'mouse'/)
  assert.doesNotMatch(source, /공부 랭킹 범위/)
  assert.doesNotMatch(source, /event\.stopPropagation\(\)/)
  assert.doesNotMatch(source, /addEventListener\('pointerdown'/)
  assert.doesNotMatch(source, /document\.createElement\('style'\)/)
  assert.doesNotMatch(source, /installStudyScrollStability/)

  assert.match(refinements, /preview-study-ranking-stage\[data-direction\]/)
  assert.match(refinements, /animation: none !important/)
  assert.match(refinements, /preview-study-ranking-stage \.preview-study-today-person/)
  assert.match(refinements, /will-change: auto !important/)

  assert.match(recovery, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(recovery, /onClick=\{\(\) => selectScope\('school'\)\}/)
  assert.equal((studyPatch.match(/touch-action: pan-y;/g) || []).length, 2)
  assert.doesNotMatch(studyPatch, /touch-action: manipulation/)
  assert.doesNotMatch(recovery, /patchStudyRankingTouchAction/)
  assert.doesNotMatch(recovery, /preview-study-ranking\.css/)
})
