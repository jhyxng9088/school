import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('final mobile fixes stylesheet is loaded after other static polish styles', () => {
  const html = read('index.html')
  const fixes = html.indexOf('mobile-layout-fixes.css?v=2')
  const samsung = html.indexOf('samsung-nav-icon-fixes.css?v=5')
  assert.ok(fixes > samsung)
})

test('academic focus titles cannot split Korean words as an emergency wrap', () => {
  const css = read('public/mobile-layout-fixes.css')
  assert.match(css, /\.academic-focus-card h2 \{[\s\S]*word-break: keep-all !important;/)
  assert.match(css, /\.academic-focus-card h2 \{[\s\S]*overflow-wrap: normal !important;/)
})

test('original viewer compensates for transformed centered ancestors on mobile', () => {
  const css = read('public/mobile-layout-fixes.css')
  assert.match(css, /html\.school-mobile-compat \.reminder-original-viewer \{[\s\S]*left: calc\(\(100% - 100vw\) \/ 2\) !important;/)
  assert.match(css, /html\.school-mobile-compat \.reminder-original-viewer \{[\s\S]*width: 100vw !important;/)
  assert.match(css, /html\.school-mobile-compat \.reminder-original-panel \{[\s\S]*max-width: calc\(100vw - 28px\);/)
  assert.doesNotMatch(css, /^\.reminder-original-viewer\s*\{/m)
})

test('mobile class station keeps one five-column layout owner during nested pill motion', () => {
  const css = read('public/mobile-layout-fixes.css')
  const nested = read('src/preview-nested-geometry-coupling-patch.js')

  assert.match(
    css,
    /html\.school-mobile-compat \.bottom-nav\[data-class-layout-spring="true"\]\[data-nested-geometry-follow="true"\] \{[\s\S]*grid-template-columns:[\s\S]*var\(--station-side-current\)[\s\S]*var\(--station-class-current\)[\s\S]*var\(--station-side-current\)[\s\S]*var\(--station-side-current\)[\s\S]*var\(--station-side-current\) !important;/,
  )
  assert.doesNotMatch(
    css,
    /html\.school-mobile-compat \.bottom-nav\[data-class-layout-spring="true"\]\[data-nested-geometry-follow="true"\][\s\S]*var\(--station-class-actual/,
  )

  // Preserve the nested pill spring and visible pressure/indicator reaction.
  assert.match(nested, /nav\.addEventListener\('classminiphysics', handleMiniPhysics\)/)
  assert.match(nested, /function syncOuterIndicatorNow\(actualLeftWidth, actualClassWidth\)/)
})


test('iPad academic content avoids the transformed compositor layer without broad mobile compatibility', () => {
  const source = read('src/main.jsx')
  const styles = read('src/styles.css')

  assert.match(source, /const MOBILE_BROWSER_COMPAT = \/iPhone\|iPod\|Android\|SamsungBrowser\/i\.test\(navigator\.userAgent\)/)
  assert.ok(source.includes("const IPAD_BROWSER_COMPAT = /\\biPad\\b/i.test(navigator.userAgent)"))
  assert.match(source, /navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/)
  assert.match(source, /if \(IPAD_BROWSER_COMPAT\) document\.documentElement\.classList\.add\('school-ipad'\)/)
  assert.match(styles, /html\.school-ipad \.app-content\.tab-academic \{[\s\S]*?animation: school-mobile-opacity-in 560ms[\s\S]*?transform: none !important;[\s\S]*?\}/)
})
