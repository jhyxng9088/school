import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Study ranking input is owned by its React control, not a document pointer interceptor', () => {
  const homeNav = read('public/school-home-nav.js')

  assert.doesNotMatch(homeNav, /deferStudyScopeTouchToClick/)
  assert.doesNotMatch(homeNav, /addEventListener\('pointerdown'/)
  assert.doesNotMatch(homeNav, /removeEventListener\('pointerdown'/)
  assert.match(homeNav, /data-study-scroll-stability/)
})

test('class roster input is owned by a real React button, not a runtime DOM enhancer', () => {
  const recovery = read('src/production-recovery-patch.js')
  const roster = read('src/class-roster-ui-v2.js')
  const home = read('src/preview-home-info-patch.js')

  assert.match(recovery, /<button[\s\S]*type="button"[\s\S]*class-presence-count is-roster-button/)
  assert.match(recovery, /onClick=\{\(event\) => openClassRoster/)
  assert.match(roster, /export function openClassRoster\(/)
  assert.doesNotMatch(roster, /function enhanceCounter/)
  assert.doesNotMatch(roster, /counter\.addEventListener\('click'/)
  assert.doesNotMatch(home, /document\.querySelector\('\.class-presence-count'\)\?\.click\(\)/)
  assert.match(home, /openClassRoster\(\)/)
})
