import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewHomeInfoImports } from '../src/preview-home-info-patch.js'

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

test('home roster import is source-owned while the migration patch stays duplicate-safe', () => {
  const main = read('src/main.jsx')
  const polite = "import { installPoliteCopyRuntime } from './polite-copy-runtime.js'\n"
  const signals = "import { PreviewHomeSignals } from './preview-home-signals.jsx'\n"
  const roster = "import { openClassRoster } from './class-roster-ui-v2.js'\n"
  const aiCore = "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n"
  const canonical = `${polite}${signals}${roster}`

  assert.equal(main.split(roster).length - 1, 1)
  assert.ok(main.includes(`${aiCore}${roster}`))
  assert.equal(patchPreviewHomeInfoImports(polite), canonical)
  assert.equal(patchPreviewHomeInfoImports(`${polite}${roster}`), canonical)
  assert.equal(patchPreviewHomeInfoImports(canonical), canonical)
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
