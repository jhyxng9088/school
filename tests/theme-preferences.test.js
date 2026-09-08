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
  assert.deepEqual(THEME_ACCENTS.map((item) => item.id), ['default', 'pink', 'blue', 'lavender', 'mint', 'peach'])
  assert.deepEqual(normalizeThemePreferences({ mode: 'neon', accent: 'red' }), { mode: 'system', accent: 'default' })

  const storage = fakeStorage()
  const root = fakeRoot()
  const saved = saveThemePreferences({ mode: 'dark', accent: 'lavender' }, storage, root)

  assert.deepEqual(saved, { mode: 'dark', accent: 'lavender' })
  assert.equal(root.dataset.themeMode, 'dark')
  assert.equal(root.dataset.themeAccent, 'lavender')
  assert.match(storage.value(), /"mode":"dark"/)
  assert.match(storage.value(), /"accent":"lavender"/)
})

test('theme settings UI owns a real button and reuses UnifiedBottomSheet', () => {
  const entry = read('src/theme-settings-entry.jsx')
  const index = read('index.html')

  assert.match(entry, /<button[\s\S]*className="theme-settings-trigger"[\s\S]*onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(entry, /<UnifiedBottomSheet/)
  assert.match(entry, /subtitle="S-Hub의 분위기를 선택해 주세요\."/)
  assert.match(index, /<div id="theme-settings-root"><\/div>/)
  assert.match(index, /src="\/src\/theme-settings-entry\.jsx"/)
  assert.match(index, /href="\/src\/theme-preferences\.css"/)
})

test('theme CSS derives surfaces from the canonical token layer without changing the default selector', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /html\[data-theme-accent="pink"\] \{ --theme-accent: #d39aaf; \}/)
  assert.match(css, /html\[data-theme-accent\] \{[\s\S]*--surface: color-mix/)
  assert.match(css, /html\[data-theme-mode="dark"\]\[data-theme-accent\]/)
  assert.doesNotMatch(css, /:root\s*\{[\s\S]*--theme-accent/)
  assert.doesNotMatch(css, /MutationObserver/)
})
