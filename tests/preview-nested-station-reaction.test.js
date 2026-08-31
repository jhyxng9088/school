import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const patch = fs.readFileSync(new URL('../src/preview-nested-station-reaction-patch.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('nested station keeps selected pill visually distinct from its outer capsule', () => {
  assert.match(patch, /class-nav-capsule[\s\S]*background: var\(--surface-glass\) !important/)
  assert.match(patch, /class-nav-mini-pill[\s\S]*background: var\(--surface\) !important/)
  assert.match(patch, /class-nav-mini-pill[\s\S]*opacity: 1 !important/)
})

test('nested selection physically pushes outer capsule and nearby station icons', () => {
  assert.match(patch, /useClassNestedReactionSpring/)
  assert.match(patch, /const stiffness = 56/)
  assert.match(patch, /const damping = 10\.5/)
  assert.match(patch, /--class-shell-react-x/)
  assert.match(patch, /--class-home-react-x/)
  assert.match(patch, /--class-ai-react-x/)
  assert.match(patch, /--class-study-react-x/)
  assert.match(patch, /--class-schedule-react-x/)
})

test('collapse stays visible until the outer capsule actually reaches one station slot', () => {
  assert.match(patch, /useClassCollapseSettledGuard/)
  assert.match(patch, /--station-class-current/)
  assert.match(patch, /--station-side-current/)
  assert.match(patch, /gap < 0\.42 && delta < 0\.035/)
  assert.match(patch, /\}, 1800\)/)
})

test('active nested label changes immediately without delayed color transition', () => {
  assert.match(patch, /class-nav-subbutton\.is-active[\s\S]*color: var\(--text\) !important/)
  assert.match(patch, /class-nav-subbutton span,[\s\S]*transition: none !important/)
})

test('vite runs nested interaction patch after the shared station spring patch', () => {
  const jelly = vite.indexOf('patchPreviewStationJellyMotionSource(next, cleanId)')
  const nested = vite.indexOf('patchPreviewNestedStationReactionSource(next, cleanId)')
  assert.ok(jelly >= 0)
  assert.ok(nested > jelly)
})
