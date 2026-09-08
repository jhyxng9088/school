import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  THEME_ACCENTS,
  THEME_MODES,
  applyThemePreferences,
  normalizeThemePreferences,
  saveThemePreferences,
} from '../src/theme-preferences.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function fakeRoot() {
  return { dataset: {} }
}

function fakeStorage(initial = null) {
  let value = initial
  return {
    getItem() { return value },
    setItem(_key, next) { value = next },
    value() { return value },
  }
}

test('theme defaults preserve the existing system/default appearance with no dataset override', () => {
  assert.deepEqual(normalizeThemePreferences(null), { mode: 'system', accent: 'default' })

  const root = fakeRoot()
  root.dataset.themeMode = 'dark'
  root.dataset.themeAccent = 'pink'
  const applied = applyThemePreferences({ mode: 'system', accent: 'default' }, root)

  assert.deepEqual(applied, { mode: 'system', accent: 'default' })
  assert.equal(root.dataset.themeMode, undefined)
  assert.equal(root.dataset.themeAccent, undefined)
})

test('theme preference owner accepts only canonical modes and accents and persists one local preference object', () => {
  assert.deepEqual(THEME_MODES.map((item) => item.id), ['system', 'light', 'dark'])
  assert.deepEqual(THEME_ACCENTS.map((item) => item.id), ['default', 'pink', 'blue', 'lavender', 'mint', 'peach', 'avocado'])
  assert.deepEqual(normalizeThemePreferences({ mode: 'neon', accent: 'red' }), { mode: 'system', accent: 'default' })

  const storage = fakeStorage()
  const root = fakeRoot()
  const saved = saveThemePreferences({ mode: 'dark', accent: 'avocado' }, storage, root)

  assert.deepEqual(saved, { mode: 'dark', accent: 'avocado' })
  assert.equal(root.dataset.themeMode, 'dark')
  assert.equal(root.dataset.themeAccent, 'avocado')
  assert.match(storage.value(), /"mode":"dark"/)
  assert.match(storage.value(), /"accent":"avocado"/)
})

test('theme settings UI owns a real button, reuses UnifiedBottomSheet, and uses the canonical schedule segment spring', () => {
  const entry = read('src/theme-settings-entry.jsx')
  const index = read('index.html')

  assert.match(entry, /<button[\s\S]*className="theme-settings-trigger"[\s\S]*onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(entry, /<UnifiedBottomSheet/)
  assert.match(entry, /subtitle="S-Hub의 분위기를 선택해 주세요\."/)
  assert.match(entry, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(entry, /paddingProperty: '--segment-padding'/)
  assert.match(entry, /shellScaleProperty: '--segment-shell-scale-x'/)
  assert.match(entry, /shellShiftProperty: '--segment-shell-shift-x'/)
  assert.match(entry, /className="class-top-segment schedule-top-segment theme-mode-segment"/)
  assert.match(entry, /className="class-top-segment-pill"/)
  assert.match(entry, /className=\{'class-top-segment-button ' \+ \(mode === item\.id \? 'is-active' : ''\)\}/)
  assert.doesNotMatch(entry, /theme-mode-options/)
  assert.match(index, /<div id="theme-settings-root"><\/div>/)
  assert.match(index, /src="\/src\/theme-settings-entry\.jsx"/)
  assert.match(index, /href="\/src\/theme-preferences\.css"/)
})

test('theme CSS visibly tints canonical surfaces plus home focus and station pill tokens', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /html\[data-theme-accent="pink"\] \{ --theme-accent: #d39aaf; \}/)
  assert.match(css, /html\[data-theme-accent="avocado"\] \{ --theme-accent: #b2c66a; \}/)
  assert.match(css, /html\[data-theme-accent\] \{[\s\S]*--surface: color-mix\(in srgb, #ffffff 84%, var\(--theme-accent\)\)/)
  assert.match(css, /--surface-soft: color-mix\(in srgb, #ececef 76%, var\(--theme-accent\)\)/)
  assert.match(css, /--focus-surface: color-mix\(in srgb, #fbfbfc 70%, var\(--theme-accent\)\)/)
  assert.match(css, /--s-hub-active-pill-surface: color-mix\(in srgb, #ffffff 68%, var\(--theme-accent\)\)/)
  assert.match(css, /html\[data-theme-mode="light"\][\s\S]*--focus-surface: #fbfbfc/)
  assert.match(css, /html\[data-theme-mode="dark"\][\s\S]*--focus-surface: #202023/)
  assert.match(css, /html\[data-theme-mode="dark"\]\[data-theme-accent\]/)
  assert.match(css, /theme-accent-option\[data-accent="avocado"\]/)
  assert.match(css, /\.theme-mode-segment[\s\S]*grid-template-columns: repeat\(3/)
  assert.doesNotMatch(css, /:root\s*\{[\s\S]*--theme-accent/)
  assert.doesNotMatch(css, /MutationObserver/)
})
