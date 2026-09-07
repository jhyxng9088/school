import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const url = (path) => new URL(`../${path}`, import.meta.url)
const read = (path) => readFileSync(url(path), 'utf8')

test('home overview cards route to the correct V2 destination without proxy-clicking DOM controls', () => {
  const main = read('src/main.jsx')
  const roster = read('src/class-roster-ui-v2.js')

  assert.match(main, /import \{ openClassRoster \} from '\.\/class-roster-ui-v2\.js'/)
  assert.match(main, /if \(target === 'class'\) \{\s*openClassRoster\(\)/)
  assert.doesNotMatch(main, /document\.querySelector\('\.class-presence-count'\)\?\.click\(\)/)
  assert.match(roster, /export function openClassRoster\(/)
  assert.doesNotMatch(roster, /counter\.addEventListener\('click'/)
  assert.match(main, /if \(target === 'board'\) \{\s*setClassSection\('board'\)\s*changeTab\('class'\)/)
  assert.match(main, /if \(target === 'study'\) \{\s*changeTab\('study'\)/)
  assert.match(main, /if \(target === 'reminder'\) \{\s*setScheduleSection\('todo'\)\s*changeTab\('schedule'\)/)
  assert.match(main, /onNavigate=\{navigateHomeSignal\}/)
  assert.match(main, /onNavigate=\{onNavigate\}/)
})

test('home source owns its imports directly after the build owner is retired', () => {
  const main = read('src/main.jsx')
  const signals = "import { PreviewHomeSignals } from './preview-home-signals.jsx'\n"
  const homeNav = "import { HomeNavAction } from './home-nav-action.jsx'\n"
  const mealPriority = "import { useHomeMealPriority } from './home-meal-priority.js'\n"
  const roster = "import { openClassRoster } from './class-roster-ui-v2.js'\n"
  const aiCore = "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n"
  const canonical = `${aiCore}${roster}${signals}${homeNav}${mealPriority}`

  assert.equal(main.split(roster).length - 1, 1)
  assert.equal(main.split(signals).length - 1, 1)
  assert.equal(main.split(homeNav).length - 1, 1)
  assert.equal(main.split(mealPriority).length - 1, 1)
  assert.ok(main.includes(canonical))
  assert.equal(existsSync(url('src/preview-home-info-patch.js')), false)
})

test('home overview uses native buttons and opts out of the legacy whole-section navigation handler', () => {
  const signals = read('src/preview-home-signals.jsx')
  const css = read('src/preview-home-signals.css')

  assert.match(signals, /data-home-nav-ready="true"/)
  assert.match(signals, /<button[\s\S]*type="button"[\s\S]*className=\{`preview-home-signal/)
  assert.match(signals, /onClick=\{\(\) => onNavigate\?\.\(signal\.id\)\}/)
  assert.doesNotMatch(signals, /role="button"/)
  assert.doesNotMatch(signals, /tabIndex=/)
  assert.doesNotMatch(signals, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.match(css, /\.preview-home-signal\s*\{[\s\S]*appearance:\s*none/)
  assert.match(css, /\.preview-home-signal\s*\{[\s\S]*text-align:\s*left/)
})

test('home overview stays a 2 by 2 grid on portrait and wide layouts', () => {
  const css = read('src/preview-home-signals.css')

  assert.match(css, /\.preview-home-signals-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
})