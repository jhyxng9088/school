import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('final mobile fixes stylesheet is loaded after other static polish styles', () => {
  const html = read('index.html')
  const fixes = html.indexOf('mobile-layout-fixes.css?v=1')
  const samsung = html.indexOf('samsung-nav-icon-fixes.css?v=4')
  assert.ok(fixes > samsung)
})

test('academic focus titles cannot split Korean words as an emergency wrap', () => {
  const css = read('public/mobile-layout-fixes.css')
  assert.match(css, /\.academic-focus-card h2 \{[\s\S]*word-break: keep-all !important;/)
  assert.match(css, /\.academic-focus-card h2 \{[\s\S]*overflow-wrap: normal !important;/)
})

test('original viewer compensates for transformed centered ancestors on mobile', () => {
  const css = read('public/mobile-layout-fixes.css')
  assert.match(css, /\.reminder-original-viewer \{[\s\S]*left: calc\(\(100% - 100vw\) \/ 2\) !important;/)
  assert.match(css, /\.reminder-original-viewer \{[\s\S]*width: 100vw !important;/)
  assert.match(css, /\.reminder-original-panel \{[\s\S]*max-width: calc\(100vw - 28px\);/)
})
