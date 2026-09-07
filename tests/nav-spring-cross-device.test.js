import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const url = (path) => new URL(`../${path}`, import.meta.url)
const read = (path) => fs.readFileSync(url(path), 'utf8')
const mainSource = read('src/main.jsx')
const styleSource = read('src/styles.css')
const viteSource = read('vite.config.js')

test('nav spring behavior is owned directly by raw main source on every device', () => {
  assert.equal(fs.existsSync(url('src/preview-nav-spring-patch.js')), false)
  assert.doesNotMatch(mainSource, /const compatibilityMotion = MOBILE_BROWSER_COMPAT/)
  assert.match(mainSource, /indicator\.dataset\.springMotion = 'true'/)
  assert.match(mainSource, /nav\.dataset\.elasticShell = 'true'/)
  assert.match(mainSource, /setProperty\('left', '0px', 'important'\)/)
  assert.match(mainSource, /setProperty\('transition', 'none', 'important'\)/)
  assert.match(mainSource, /setProperty\('transform',[\s\S]*'important'\)/)
  assert.match(mainSource, /setProperty\('border-radius',[\s\S]*'important'\)/)
})

test('raw nav spring keeps the proven universal physics constants', () => {
  assert.match(mainSource, /const stiffness = 56/)
  assert.match(mainSource, /const damping = 10\.5/)
  assert.match(mainSource, /const mass = 1/)
})

test('elastic shell expands only when the stretched indicator consumes the edge padding', () => {
  assert.match(mainSource, /const navPadding = Number\.parseFloat\(window\.getComputedStyle\(nav\)\.getPropertyValue\('--nav-padding'\)\) \|\| 5/)
  assert.match(mainSource, /const leftShellStretch = Math\.max\(0, navPadding - visualX\)/)
  assert.match(mainSource, /const rightShellStretch = Math\.max\(0, visualRight - \(nav\.clientWidth - navPadding\)\)/)
  assert.match(mainSource, /const shellScaleX = \(nav\.clientWidth \+ leftShellStretch \+ rightShellStretch\) \/ nav\.clientWidth/)
  assert.match(mainSource, /const shellShiftX = \(rightShellStretch - leftShellStretch\) \/ 2/)
  assert.match(mainSource, /--nav-shell-scale-x/)
  assert.match(mainSource, /--nav-shell-shift-x/)
})

test('elastic shell is visual-only so button spacing and nav layout do not reflow', () => {
  assert.match(styleSource, /\.bottom-nav\[data-elastic-shell="true"\] \{[\s\S]*overflow: visible;[\s\S]*contain: layout;/)
  assert.match(styleSource, /\.bottom-nav\[data-elastic-shell="true"\]::before \{[\s\S]*scaleX\(var\(--nav-shell-scale-x, 1\)\)/)
  assert.match(styleSource, /translate3d\(var\(--nav-shell-shift-x, 0px\), 0, 0\)/)
  assert.match(styleSource, /\.bottom-nav\[data-elastic-shell="true"\] \.nav-button \{\s*z-index: 2;/)
})

test('mobile compositor protections stay enabled alongside the source-owned spring shell', () => {
  assert.match(styleSource, /html\.school-samsung \.bottom-nav \{[\s\S]*backdrop-filter: none;/)
  assert.match(styleSource, /html\.school-samsung \.app-content \{[\s\S]*transform: none !important;/)
  assert.match(styleSource, /html\.school-mobile-compat:not\(\.school-samsung\) \.app-content\.tab-academic \{[\s\S]*transform: none !important;/)
  assert.match(styleSource, /html\.school-samsung \.bottom-nav\[data-elastic-shell="true"\]::before \{[\s\S]*backdrop-filter: none;/)
})

test('Vite no longer owns nav spring behavior through a build transform', () => {
  assert.doesNotMatch(viteSource, /preview-nav-spring-patch\.js/)
  assert.doesNotMatch(viteSource, /patchPreviewNavSpringSource/)
})