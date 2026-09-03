import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home overview cards route to the correct V2 destination without proxy-clicking DOM controls', () => {
  const patch = read('src/preview-home-info-patch.js')
  const roster = read('src/class-roster-ui-v2.js')

  assert.match(patch, /import \{ openClassRoster \} from '\.\/class-roster-ui-v2\.js'/)
  assert.ok(patch.includes("if (target === 'class') {\\n      openClassRoster()"))
  assert.doesNotMatch(patch, /document\.querySelector\('\.class-presence-count'\)\?\.click\(\)/)
  assert.match(roster, /export function openClassRoster\(/)
  assert.doesNotMatch(roster, /counter\.addEventListener\('click'/)
  assert.ok(patch.includes("if (target === 'board') {\\n      setClassSection('board')\\n      changeTab('class')"))
  assert.ok(patch.includes("if (target === 'study') {\\n      changeTab('study')"))
  assert.ok(patch.includes("if (target === 'reminder') {\\n      setScheduleSection('todo')\\n      changeTab('schedule')"))
  assert.match(patch, /onNavigate=\{navigateHomeSignal\}/)
  assert.match(patch, /onNavigate=\{onNavigate\}/)
})

test('home overview section opts out of the legacy whole-section navigation handler', () => {
  const signals = read('src/preview-home-signals.jsx')

  assert.match(signals, /data-home-nav-ready="true"/)
  assert.match(signals, /role="button"/)
  assert.match(signals, /onClick=\{\(\) => onNavigate\?\.\(signal\.id\)\}/)
  assert.match(signals, /event\.key !== 'Enter' && event\.key !== ' '/)
})

test('home overview stays a 2 by 2 grid on portrait and wide layouts', () => {
  const css = read('src/preview-home-signals.css')

  assert.match(css, /\.preview-home-signals-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
})
