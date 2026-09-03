import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home cards use semantic V2 destinations through the shared navigation owner', () => {
  const source = read('public/school-home-nav.js')

  assert.doesNotMatch(source, /navIndex/)
  assert.match(source, /\.current-class-card/)
  assert.match(source, /\.todo-home-preview/)
  assert.match(source, /\.academic-preview/)
  assert.match(source, /\.meal-preview/)
  assert.match(source, /\.period-strip, \.today-timetable-empty/)
  assert.match(source, /SHubNavigation\?\.navigate\(route\)/)
  assert.doesNotMatch(source, /\.bottom-nav \.nav-button/)
  assert.doesNotMatch(source, /afterReactCommit/)
  assert.doesNotMatch(source, /station-schedule-switcher/)
})

test('study touch scope changes wait for click and ranking transforms are disabled', () => {
  const source = read('public/school-home-nav.js')

  assert.match(source, /pointerType === 'mouse'/)
  assert.match(source, /공부 랭킹 범위/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /preview-study-ranking-stage\[data-direction\]/)
  assert.match(source, /animation: none !important/)
  assert.match(source, /preview-study-ranking-stage \.preview-study-today-person/)
})
