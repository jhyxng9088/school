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

test('theme preference owner keeps one canonical palette and migrates legacy sand to cream', () => {
  assert.deepEqual(THEME_MODES.map((item) => item.id), ['system', 'light', 'dark'])
  assert.deepEqual(THEME_ACCENTS.map((item) => item.id), [
    'default',
    'gray',
    'pink',
    'blue',
    'lavender',
    'mint',
    'peach',
    'avocado',
    'cream',
    'ivory',
  ])
  assert.deepEqual(normalizeThemePreferences({ mode: 'neon', accent: 'red' }), { mode: 'system', accent: 'default' })
  assert.deepEqual(normalizeThemePreferences({ mode: 'dark', accent: 'sand' }), { mode: 'dark', accent: 'cream' })

  const storage = fakeStorage()
  const root = fakeRoot()
  const saved = saveThemePreferences({ mode: 'dark', accent: 'gray' }, storage, root)

  assert.deepEqual(saved, { mode: 'dark', accent: 'gray' })
  assert.equal(root.dataset.themeMode, 'dark')
  assert.equal(root.dataset.themeAccent, 'gray')
  assert.match(storage.value(), /"mode":"dark"/)
  assert.match(storage.value(), /"accent":"gray"/)
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
  assert.match(entry, /<span className="theme-mode-label">\{item\.label\}<\/span>/)
  assert.doesNotMatch(entry, />\s*테마\s*<\/button>/)
  assert.match(index, /<div id="theme-settings-root"><\/div>/)
  assert.match(index, /src="\/src\/theme-settings-entry\.jsx"/)
  assert.match(index, /href="\/src\/theme-preferences\.css"/)
})

test('theme mode text is statically painted while the canonical pill remains the only moving selector', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /\.theme-mode-segment \.class-top-segment-button \{[\s\S]*opacity: 1 !important[\s\S]*visibility: visible !important/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button \{[\s\S]*animation: none !important/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button \{[\s\S]*animation-delay: 0ms !important/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button \{[\s\S]*transition: transform 90ms/)
  assert.match(css, /\.theme-mode-label \{[\s\S]*animation: none !important[\s\S]*transition: none !important/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button\.is-active[\s\S]*color: var\(--text\) !important/)
})

test('light accents are more visible and dark accents tint the whole canvas with a paired deep color', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /@property --bg/)
  assert.match(css, /html\s*\{[\s\S]*transition-property:[\s\S]*--bg[\s\S]*--focus-accent-soft/)
  assert.match(css, /transition-duration: 460ms/)
  assert.match(css, /html\[data-theme-accent="pink"\] \{[\s\S]*--theme-accent: #d39aaf[\s\S]*--theme-dark-accent: #8e536a/)
  assert.match(css, /html\[data-theme-accent\] \{[\s\S]*--bg: color-mix\(in srgb, #f5f5f7 82%, var\(--theme-accent\)\)/)
  assert.match(css, /--surface: color-mix\(in srgb, #ffffff 77%, var\(--theme-accent\)\)/)
  assert.match(css, /--surface-soft: color-mix\(in srgb, #ececef 68%, var\(--theme-accent\)\)/)
  assert.match(css, /--focus-surface: color-mix\(in srgb, #fbfbfc 61%, var\(--theme-accent\)\)/)
  assert.match(css, /--s-hub-active-pill-surface: color-mix\(in srgb, #ffffff 60%, var\(--theme-accent\)\)/)
  assert.match(css, /html\[data-theme-mode="dark"\]\[data-theme-accent\] \{[\s\S]*--bg: color-mix\(in srgb, #101012 78%, var\(--theme-dark-accent\)\)/)
  assert.match(css, /html\[data-theme-mode="dark"\]\[data-theme-accent\] \{[\s\S]*--surface: color-mix\(in srgb, #1b191d 68%, var\(--theme-dark-accent\)\)/)
  assert.doesNotMatch(css, /html\[data-theme-mode="dark"\]\[data-theme-accent\] \{\s*--bg:\s*#000000/)
})

test('theme palette adds gray, keeps cream and ivory, and removes sand from selectable CSS', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /html\[data-theme-accent="gray"\] \{[\s\S]*--theme-accent: #a9aab0[\s\S]*--theme-dark-accent: #5d6068/)
  assert.match(css, /html\[data-theme-accent="cream"\] \{[\s\S]*--theme-accent: #e2c487/)
  assert.match(css, /html\[data-theme-accent="ivory"\] \{[\s\S]*--theme-accent: #e7deca/)
  assert.match(css, /theme-accent-option\[data-accent="gray"\]/)
  assert.match(css, /theme-accent-option\[data-accent="cream"\]/)
  assert.match(css, /theme-accent-option\[data-accent="ivory"\]/)
  assert.doesNotMatch(css, /data-theme-accent="sand"/)
  assert.doesNotMatch(css, /data-accent="sand"/)
  assert.doesNotMatch(css, /MutationObserver/)
})

test('theme settings trigger remains a corner circular control', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /#theme-settings-root \{[\s\S]*position: absolute[\s\S]*top: calc\(max\(32px, env\(safe-area-inset-top\)\) \+ 34px\)/)
  assert.match(css, /#theme-settings-root \{[\s\S]*right: max\(64px, calc\(\(100vw - 720px\) \/ 2 \+ 64px\)\)/)
  assert.match(css, /\.theme-settings-trigger \{[\s\S]*width: 34px[\s\S]*height: 34px[\s\S]*border-radius: 50%/)
  assert.doesNotMatch(css, /bottom: calc\(var\(--nav-bottom/)
})
