import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const indexSource = read('index.html')
const samsungStyles = read('public/samsung-nav-icon-fixes.css')
const baseStyles = read('src/styles.css')

test('Samsung browser is marked before stylesheets load so dark palette applies on first paint', () => {
  assert.match(indexSource, /const samsungBrowser = \/SamsungBrowser\/i\.test\(ua\)/)
  assert.match(indexSource, /if \(samsungBrowser\) \{[\s\S]*classList\.add\('school-samsung'\)/)
  assert.ok(
    indexSource.indexOf("classList.add('school-samsung')") < indexSource.indexOf('samsung-nav-icon-fixes.css?v=5'),
    'Samsung class must be installed before the Samsung stylesheet is parsed',
  )
})

test('Samsung dark mode owns its palette instead of accepting a second browser remap', () => {
  assert.match(samsungStyles, /@media \(prefers-color-scheme: dark\) \{[\s\S]*html\.school-samsung \{[\s\S]*color-scheme: only dark;/)
  assert.match(samsungStyles, /--bg: #000000;/)
  assert.match(samsungStyles, /--surface: #1c1c1e;/)
  assert.match(samsungStyles, /--surface-soft: #2c2c2e;/)
  assert.match(samsungStyles, /--text: #f5f5f7;/)
})

test('Samsung keeps compositor-safe nav rendering while restoring iPad-like depth', () => {
  assert.match(baseStyles, /html\.school-samsung \.bottom-nav \{[\s\S]*backdrop-filter: none;/)
  assert.match(samsungStyles, /--samsung-nav-surface: #242426;/)
  assert.match(samsungStyles, /--samsung-nav-selected: #3a3a3c;/)
  assert.match(samsungStyles, /html\.school-samsung \.bottom-nav \{[\s\S]*background: var\(--samsung-nav-surface\) !important;[\s\S]*backdrop-filter: none !important;/)
  assert.match(samsungStyles, /html\.school-samsung \.nav-indicator \{[\s\S]*background: var\(--samsung-nav-selected\) !important;/)
})

test('Samsung dark mode restores high-emphasis add buttons without changing other platforms', () => {
  assert.match(samsungStyles, /html\.school-samsung \.todo-add-button,[\s\S]*html\.school-samsung \.academic-add-button \{[\s\S]*background: #f5f5f7 !important;[\s\S]*color: #111113 !important;/)
  assert.doesNotMatch(samsungStyles, /(^|\n)\s*\.todo-add-button\s*\{/)
  assert.doesNotMatch(samsungStyles, /(^|\n)\s*\.academic-add-button\s*\{/)
})

test('existing Samsung icon and AI-orb compatibility protections remain intact', () => {
  assert.match(samsungStyles, /html\.school-samsung \.bottom-nav \.nav-button > svg/)
  assert.match(samsungStyles, /html\.school-samsung \.home-ai-trigger \.s-hub-ai-orb canvas/)
})
