import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Study ranking input is owned by its React control, not a document pointer interceptor', () => {
  const refinements = read('public/school-refinements.css')
  const studyPatch = read('src/preview-study-patch.js')
  const recovery = read('src/production-recovery-patch.js')

  assert.match(refinements, /preview-study-ranking-stage\[data-direction\]/)
  assert.match(refinements, /preview-study-ranking-stage \.preview-study-today-person/)
  assert.match(refinements, /animation: none !important/)
  assert.match(refinements, /will-change: auto !important/)

  assert.match(recovery, /onClick=\{\(\) => selectScope\('class'\)\}/)
  assert.match(recovery, /onClick=\{\(\) => selectScope\('school'\)\}/)
  assert.equal((studyPatch.match(/touch-action: pan-y;/g) || []).length, 2)
  assert.doesNotMatch(studyPatch, /touch-action: manipulation/)
  assert.doesNotMatch(recovery, /patchStudyRankingTouchAction/)
  assert.doesNotMatch(recovery, /preview-study-ranking\.css/)
})

test('class roster input is owned by a real React button, not a runtime DOM enhancer', () => {
  const main = read('src/main.jsx')
  const recovery = read('src/production-recovery-patch.js')
  const roster = read('src/class-roster-ui-v2.js')
  const home = read('src/preview-home-info-patch.js')

  assert.match(main, /<button[\s\S]*type="button"[\s\S]*class-presence-count is-roster-button/)
  assert.match(main, /onClick=\{\(event\) => openClassRoster/)
  assert.doesNotMatch(recovery, /patchMainPresence/)
  assert.match(roster, /export function openClassRoster\(/)
  assert.doesNotMatch(roster, /function enhanceCounter/)
  assert.doesNotMatch(roster, /counter\.addEventListener\('click'/)
  assert.doesNotMatch(home, /document\.querySelector\('\.class-presence-count'\)\?\.click\(\)/)
  assert.match(home, /openClassRoster\(\)/)
})
