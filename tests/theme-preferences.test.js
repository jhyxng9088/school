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
  assert.match(entry, /className="theme-mode-label-layer" aria-hidden="true"/)
  assert.match(entry, /className=\{`theme-mode-visual-label \$\{mode === item\.id \? 'is-active' : ''\}`\}/)
  assert.match(entry, /className=\{'class-top-segment-button ' \+ \(mode === item\.id \? 'is-active' : ''\)\}/)
  assert.match(entry, /<span className="theme-mode-label">\{item\.label\}<\/span>/)
  assert.doesNotMatch(entry, />\s*테마\s*<\/button>/)
  assert.match(index, /<div id="theme-settings-root"><\/div>/)
  assert.match(index, /src="\/src\/theme-settings-entry\.jsx"/)
  assert.match(index, /href="\/src\/theme-preferences\.css"/)
})

test('theme mode labels paint as one fixed visual layer while the canonical pill remains the only moving selector', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /\.theme-mode-segment \{[\s\S]*contain: layout paint !important[\s\S]*transform: translateZ\(0\)/)
  assert.match(css, /\.theme-mode-segment \.class-top-segment-button \{[\s\S]*animation: none !important[\s\S]*color: transparent !important/)
  assert.match(css, /\.theme-mode-label \{[\s\S]*clip-path: inset\(50%\) !important[\s\S]*animation: none !important[\s\S]*transition: none !important/)
  assert.match(css, /\.theme-mode-label-layer \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)[\s\S]*pointer-events: none[\s\S]*contain: paint/)
  assert.match(css, /\.theme-mode-visual-label \{[\s\S]*animation: none !important[\s\S]*transition: none !important/)
  assert.match(css, /\.theme-mode-visual-label\.is-active \{[\s\S]*color: var\(--text\)/)
})

test('light accents are visibly stronger while dark accents keep the paired deep canvas', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /@property --bg/)
  assert.match(css, /html\s*\{[\s\S]*transition-property:[\s\S]*--bg[\s\S]*--focus-accent-soft/)
  assert.match(css, /transition-duration: 460ms/)
  assert.match(css, /html\[data-theme-accent="pink"\] \{[\s\S]*--theme-accent: #d39aaf[\s\S]*--theme-dark-accent: #8e536a/)
  assert.match(css, /@media \(prefers-color-scheme: light\) \{[\s\S]*html:not\(\[data-theme-mode\]\)\[data-theme-accent\] \{[\s\S]*--bg: color-mix\(in srgb, #f5f5f7 76%, var\(--theme-accent\)\)[\s\S]*--surface: color-mix\(in srgb, #ffffff 70%, var\(--theme-accent\)\)[\s\S]*--surface-soft: color-mix\(in srgb, #ececef 60%, var\(--theme-accent\)\)/)
  assert.match(css, /html\[data-theme-mode="light"\]\[data-theme-accent\] \{[\s\S]*--s-hub-active-pill-surface: color-mix\(in srgb, #ffffff 50%, var\(--theme-accent\)\)[\s\S]*--focus-surface: color-mix\(in srgb, #fbfbfc 52%, var\(--theme-accent\)\)/)
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

test('default theme swatch is a clean black-white circle with no rectangular focus artifact', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /\.theme-accent-swatch \{[\s\S]*aspect-ratio: 1[\s\S]*overflow: hidden[\s\S]*border-radius: 999px[\s\S]*clip-path: circle\(50% at 50% 50%\)/)
  assert.match(css, /\.theme-accent-option \{[\s\S]*outline: none/)
  assert.match(css, /theme-accent-option\[data-accent="default"\] \.theme-accent-swatch \{[\s\S]*linear-gradient\(90deg, #f5f5f7 0 50%, #1c1c1e 50% 100%\)[\s\S]*box-shadow: none/)
  assert.match(css, /\.theme-accent-option:focus-visible \.theme-accent-swatch \{[\s\S]*box-shadow:/)
})

test('theme settings trigger follows the username on its right without colliding with Home AI', () => {
  const css = read('src/theme-preferences.css')

  assert.match(css, /\.home-top-actions \.user-name \{[\s\S]*anchor-name: --home-user-name/)
  assert.match(css, /#theme-settings-root \{[\s\S]*position: absolute[\s\S]*position-anchor: --home-user-name[\s\S]*top: anchor\(--home-user-name center\)[\s\S]*left: anchor\(--home-user-name right\)[\s\S]*translate: 9px -50%/)
  assert.match(css, /body:has\(\.app-content\.tab-home\) \.home-top-actions \.home-ai-trigger \{[\s\S]*margin-left: 43px/)
  assert.match(css, /@keyframes theme-settings-home-in \{[\s\S]*translate3d\(0, -1px, 0\)/)
  assert.match(css, /body:has\(\.app-content\.tab-home\) #theme-settings-root \{[\s\S]*transform: translate3d\(0, -1px, 0\) scale\(1\)[\s\S]*animation: theme-settings-home-in 980ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both/)
  assert.match(css, /html\.school-mobile-compat body:has\(\.app-content\.tab-home\) #theme-settings-root \{[\s\S]*animation-duration: 760ms/)
  assert.match(css, /\.theme-settings-trigger \{[\s\S]*width: 34px[\s\S]*height: 34px[\s\S]*border-radius: 50%/)
  assert.doesNotMatch(css, /100vw\s*-\s*720px/)
  assert.doesNotMatch(css, /#theme-settings-root \{[\s\S]*?\bright:/)
  assert.doesNotMatch(css, /body:has\(\.app-content\.tab-home\) \.home-top-actions \{[\s\S]*?padding-right:/)
  assert.doesNotMatch(css, /bottom: calc\(var\(--nav-bottom/)
})
