import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home cards use semantic V2 destinations through React-owned navigation', () => {
  const homePatch = read('src/preview-home-info-patch.js')
  const meal = read('src/home-meal-preview.jsx')
  const academic = read('src/academic-shared.jsx')
  const todo = read('src/todo.jsx')
  const action = read('src/home-nav-action.jsx')
  const index = read('index.html')
  const sw = read('public/sw.js')

  assert.match(homePatch, /HOME_NAV_ACTION_IMPORT/)
  assert.match(homePatch, /current-class-card home-nav-native-surface/)
  assert.match(homePatch, /today-timetable-empty/)
  assert.match(homePatch, /className="period-strip"/)
  assert.equal((homePatch.match(/<HomeNavAction tab="class" section="timetable" label="시간표 열기" \/>/g) || []).length, 3)

  assert.match(meal, /<HomeNavAction tab="schedule" section="meal" label="급식 열기" \/>/)
  assert.match(academic, /<HomeNavAction tab="schedule" section="academic" label="학사일정 열기" \/>/)
  assert.match(todo, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(todo, /todo-home-preview home-nav-native-surface" data-home-nav-ready="true"/)
  assert.match(todo, /<HomeNavAction tab="schedule" section="todo" label="리마인더 열기" \/>/)
  assert.match(action, /window\.SHubNavigation\?\.navigate\(\{ tab, section \}\)/)

  assert.doesNotMatch(index, /school-home-nav\.js/)
  assert.doesNotMatch(sw, /school-home-nav\.js/)
  assert.match(sw, /school-shell-v161-home-nav-owner/)
})

test('study ranking keeps the existing scroll-stability rules without runtime style injection', () => {
  const live = read('public/school-home-live.js')
  const refinements = read('public/school-refinements.css')
  const studyPatch = read('src/preview-study-patch.js')
  const recovery = read('src/production-recovery-patch.js')

  assert.doesNotMatch(live, /pointerType === 'mouse'/)
  assert.doesNotMatch(live, /공부 랭킹 범위/)
  assert.doesNotMatch(live, /event\.stopPropagation\(\)/)
  assert.doesNotMatch(live, /addEventListener\('pointerdown'/)
  assert.doesNotMatch(live, /document\.createElement\('style'\)/)
  assert.doesNotMatch(live, /installStudyScrollStability/)

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
