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
  assert.equal(homePatch.split('<HomeNavAction tab="class" section="timetable" label="시간표 열기" />').length - 1, 3)

  assert.match(meal, /<HomeNavAction tab="schedule" section="meal" label="급식 열기" \/>/)
  assert.match(academic, /<HomeNavAction tab="schedule" section="academic" label="학사일정 열기" \/>/)
  assert.match(todo, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(todo, /todo-home-preview home-nav-native-surface" data-home-nav-ready="true"/)
  assert.match(todo, /<HomeNavAction tab="schedule" section="todo" label="리마인더 열기" \/>/)
  assert.match(action, /window\.SHubNavigation\?\.navigate\(\{ tab, section \}\)/)

  assert.doesNotMatch(index, /school-home-nav\.js/)
  assert.doesNotMatch(sw, /school-home-nav\.js/)
})

test('study ranking keeps the existing scroll-stability rules with direct React input ownership', () => {
  const refinements = read('public/school-refinements.css')
  const studyPatch = read('src/preview-study-patch.js')

  assert.match(refinements, /preview-study-ranking-stage\[data-direction\]/)
  assert.match(refinements, /animation: none !important/)
  assert.match(refinements, /preview-study-ranking-stage \.preview-study-today-person/)
  assert.match(refinements, /will-change: auto !important/)

  assert.match(studyPatch, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(studyPatch, /onClick=\{\(\) => selectScope\('school'\)\}/)
  assert.doesNotMatch(studyPatch, /touchIntentRef/)
  assert.doesNotMatch(studyPatch, /onPointerDown=/)
  assert.equal((studyPatch.match(/touch-action: pan-y;/g) || []).length, 2)
  assert.doesNotMatch(studyPatch, /touch-action: manipulation/)
})
