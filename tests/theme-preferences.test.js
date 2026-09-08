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
  assert.deepEqual(THEME_ACCENTS.map((item) => item.id), [
    'default',
    'pink',
    'blue',
    'lavender',
    'mint',
    'peach',
    'avocado',
    'cream',
    'ivory',
    'sand',
  ])
  assert.deepEqual(normalizeThemePreferences({ mode: 'neon', accent: 'red' }), { mode: 'system', accent: 'default' })

  const storage = fakeStorage()
  const root = fakeRoot()
  const saved = saveThemePreferences({ mode: 'dark', accent: 'ivory' }, storage, root)

  assert.deepEqual(saved, { mode: 'dark', accent: 'ivory' })
  assert.equal(root.dataset.themeMode, 'dark')
  assert.equal(root.dataset.themeAccent, 'ivory')
  assert.match(storage.value(), /"mode":"dark"/)
  assert.match(storage.value(), /"accent":"ivory"/)
})

test('theme settings UI owns a real circular settings button, reuses UnifiedBottomSheet, and uses the canonical schedule segment spring', () => {
  const entry = read('src/theme-settings-entry.jsx')
  const icon = read('src/s-hub-icon.jsx')
  const index = read('index.html')

  assert.match(entry, /<button[\s\S]*className="theme-settings-trigger"[\s\S]*onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(entry, /<SHubIcon name="settings" size=\{17\} \/>/)
  assert.match(icon, /if \(name === 'settings'\)/)
  assert.match(entry, /<UnifiedBottomSheet/)
  assert.match(entry, /subtitle="S-Hub의 분위기를 선택해 주세요\."/)
  assert.match(entry, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(entry, /paddingProperty: '--segment-padding'/)
  assert.match(entry, /shellScaleProperty: '--segment-shell-scale-x'/)
  assert.match(entry, /shellShiftProperty: '--segment-shell-shift-x'/)
  assert.match(entry, /className="class-top-segment schedule-top-segment theme-mode-segment"/)
  assert.match(entry, /className="class-top-segment-pill"/)
  assert.match(entry, /className=\{'class-top-segment-button ' \+ \(mode === item\.id \? 'is-active' : ''\)\}/)
  assert.doesNotMatch(entry, />\s*테마\s*<\/button>/)
  assert.match(index, /<div id="theme-settings-root"><\/div>/)
  assert.match(index, /src="\/src\/theme-settings-entry\.jsx"/)
  assert.match(index, /href="\/src\/theme-preferences\.css"/)
})

test('theme CSS smoothly interpolates canonical tokens, keeps labels stable, and slightly strengthens light accents', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /@property --bg/)
  assert.match(css, /@property --surface/)
  assert.match(css, /@property --focus-surface/)
  assert.match(css, /html\s*\{[\s\S]*transition-property:[\s\S]*--bg[\s\S]*--focus-accent-soft/)
  assert.match(css, /transition-duration: 460ms/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button[\s\S]*opacity: 1 !important/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button\.is-active[\s\S]*color: var\(--text\) !important/)
  assert.match(css, /html\[data-theme-accent\] \{[\s\S]*--surface: color-mix\(in srgb, #ffffff 81%, var\(--theme-accent\)\)/)
  assert.match(css, /--surface-soft: color-mix\(in srgb, #ececef 72%, var\(--theme-accent\)\)/)
  assert.match(css, /--focus-surface: color-mix\(in srgb, #fbfbfc 66%, var\(--theme-accent\)\)/)
  assert.match(css, /--s-hub-active-pill-surface: color-mix\(in srgb, #ffffff 64%, var\(--theme-accent\)\)/)
  assert.match(css, /html\[data-theme-mode="dark"\]\[data-theme-accent\][\s\S]*--surface: color-mix\(in srgb, #1c1c1e 80%, var\(--theme-accent\)\)/)
})

test('theme palette includes avocado plus warm cream, ivory and sand without bypassing canonical tokens', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /html\[data-theme-accent="avocado"\] \{ --theme-accent: #b2c66a; \}/)
  assert.match(css, /html\[data-theme-accent="cream"\] \{ --theme-accent: #e2c487; \}/)
  assert.match(css, /html\[data-theme-accent="ivory"\] \{ --theme-accent: #e7deca; \}/)
  assert.match(css, /html\[data-theme-accent="sand"\] \{ --theme-accent: #c8b295; \}/)
  assert.match(css, /theme-accent-option\[data-accent="cream"\]/)
  assert.match(css, /theme-accent-option\[data-accent="ivory"\]/)
  assert.match(css, /theme-accent-option\[data-accent="sand"\]/)
  assert.doesNotMatch(css, /:root\s*\{[\s\S]*--theme-accent/)
  assert.doesNotMatch(css, /MutationObserver/)
})

test('theme settings trigger is a corner circular control instead of the old bottom-nav text button', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /#theme-settings-root \{[\s\S]*position: absolute[\s\S]*top: calc\(max\(32px, env\(safe-area-inset-top\)\) \+ 34px\)/)
  assert.match(css, /#theme-settings-root \{[\s\S]*right: max\(64px, calc\(\(100vw - 720px\) \/ 2 \+ 64px\)\)/)
  assert.match(css, /\.theme-settings-trigger \{[\s\S]*width: 34px[\s\S]*height: 34px[\s\S]*border-radius: 50%/)
  assert.doesNotMatch(css, /bottom: calc\(var\(--nav-bottom/)
})
