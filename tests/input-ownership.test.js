import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Study ranking input is owned by its React control, not a document pointer interceptor', () => {
  const refinements = read('public/school-refinements.css')
  const study = read('src/preview-study.jsx')
  const rankingCss = read('src/preview-study-ranking.css')

  assert.doesNotMatch(refinements, /preview-study-ranking-stage\[data-direction\]/)
  assert.doesNotMatch(refinements, /preview-study-ranking-stage \.preview-study-today-person/)

  assert.match(study, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(study, /onClick=\{\(\) => selectScope\('school'\)\}/)
  assert.doesNotMatch(study, /touchIntentRef/)
  assert.doesNotMatch(study, /onPointerDown=/)
  assert.equal((rankingCss.match(/touch-action: pan-y;/g) || []).length, 2)
  assert.doesNotMatch(rankingCss, /touch-action: manipulation/)
})

test('class roster input is owned by a real React button, not a runtime DOM enhancer', () => {
  const main = read('src/main.jsx')
  const roster = read('src/class-roster-ui-v2.js')

  assert.match(main, /<button[\s\S]*type="button"[\s\S]*class-presence-count is-roster-button/)
  assert.match(main, /onClick=\{\(event\) => openClassRoster/)
  assert.match(roster, /export function openClassRoster\(/)
  assert.doesNotMatch(roster, /function enhanceCounter/)
  assert.doesNotMatch(roster, /counter\.addEventListener\('click'/)
  assert.doesNotMatch(main, /document\.querySelector\('\.class-presence-count'\)\?\.click\(\)/)
  assert.match(main, /if \(target === 'class'\) \{\s*openClassRoster\(\)/)
})