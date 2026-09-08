import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEME_ACCENTS, THEME_MODES } from '../src/theme-preferences.js'

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function extractIds(pattern) {
  const match = index.match(pattern)
  assert.ok(match, `missing first-paint id list: ${pattern}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
}

test('stored theme hydrates before the render-blocking theme stylesheet', () => {
  const storageRead = index.indexOf("localStorage.getItem('school.themePreferences.v1')")
  const themeStylesheet = index.indexOf('href="/src/theme-preferences.css"')

  assert.ok(storageRead > -1)
  assert.ok(themeStylesheet > -1)
  assert.ok(storageRead < themeStylesheet)
  assert.match(index, /root\.style\.setProperty\('transition', 'none', 'important'\)/)
  assert.match(index, /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(\(\) => root\.style\.removeProperty\('transition'\)\)/)
})

test('first-paint ids stay synchronized with the canonical theme preference owner', () => {
  const firstPaintModes = extractIds(/const firstPaintModes = new Set\(\[([^\]]+)\]\)/)
  const firstPaintAccents = extractIds(/const firstPaintAccents = new Set\(\[([\s\S]*?)\]\)/)

  assert.deepEqual(firstPaintModes, THEME_MODES.map((item) => item.id).filter((id) => id !== 'system'))
  assert.deepEqual(firstPaintAccents, THEME_ACCENTS.map((item) => item.id).filter((id) => id !== 'default'))
  assert.match(index, /stored\?\.accent === 'sand' \? 'cream' : stored\?\.accent/)
})

test('module startup remains the canonical normalizer after first paint hydration', () => {
  const entry = readFileSync(new URL('../src/theme-settings-entry.jsx', import.meta.url), 'utf8')

  assert.match(entry, /initializeThemePreferences\(\)/)
  assert.match(index, /The canonical theme owner will fall back to system\/default after module startup/)
})
