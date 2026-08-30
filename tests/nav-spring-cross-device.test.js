import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PREVIEW_NAV_SPRING, patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const mainSource = read('src/main.jsx')
const styleSource = read('src/styles.css')
const viteSource = read('vite.config.js')

test('preview build keeps the production source intact and opens the existing nav spring on every device', () => {
  assert.match(mainSource, /const compatibilityMotion = MOBILE_BROWSER_COMPAT/)
  assert.match(mainSource, /const stiffness = 50/)
  assert.match(mainSource, /const damping = 10/)

  const patched = patchPreviewNavSpringSource(mainSource, '/workspace/src/main.jsx')
  assert.doesNotMatch(patched, /const compatibilityMotion = MOBILE_BROWSER_COMPAT/)
  assert.match(patched, /indicator\.dataset\.springMotion = 'true'/)
  assert.match(patched, /setProperty\('left', '0px', 'important'\)/)
  assert.match(patched, /setProperty\('transition', 'none', 'important'\)/)
  assert.match(patched, /setProperty\('transform',[\s\S]*'important'\)/)
  assert.match(patched, /setProperty\('border-radius',[\s\S]*'important'\)/)
})

test('preview nav spring is only slightly faster than the proven iPad physics', () => {
  assert.equal(PREVIEW_NAV_SPRING.stiffness, 56)
  assert.equal(PREVIEW_NAV_SPRING.damping, 10.5)
  assert.equal(PREVIEW_NAV_SPRING.mass, 1)

  const patched = patchPreviewNavSpringSource(mainSource, '/workspace/src/main.jsx')
  assert.match(patched, /const stiffness = 56/)
  assert.match(patched, /const damping = 10\.5/)
  assert.match(patched, /const mass = 1/)
})

test('mobile compositor protections stay enabled while the indicator uses the same spring', () => {
  assert.match(styleSource, /html\.school-samsung \.bottom-nav \{[\s\S]*backdrop-filter: none;/)
  assert.match(styleSource, /html\.school-samsung \.app-content \{[\s\S]*transform: none !important;/)
  assert.match(styleSource, /html\.school-mobile-compat:not\(\.school-samsung\) \.app-content\.tab-academic \{[\s\S]*transform: none !important;/)
})

test('preview Vite transform actually applies the guarded nav spring patch', () => {
  assert.match(viteSource, /import \{ patchPreviewNavSpringSource \} from '\.\/src\/preview-nav-spring-patch\.js'/)
  assert.match(viteSource, /next = patchPreviewNavSpringSource\(next, cleanId\)/)
})

test('spring patch fails closed if the proven physics markers drift', () => {
  const drifted = mainSource.replace('      const stiffness = 50', '      const stiffness = 51')
  assert.throws(
    () => patchPreviewNavSpringSource(drifted, '/workspace/src/main.jsx'),
    /physics marker changed unexpectedly/,
  )
})
