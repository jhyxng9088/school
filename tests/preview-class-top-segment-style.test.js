import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewClassTopSegmentStyleSource } from '../src/preview-class-top-segment-style-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('class top segment is centered and slightly thinner', () => {
  const source = patchPreviewClassTopSegmentStyleSource('', '/workspace/src/styles.css')
  assert.match(source, /height: 44px !important/)
  assert.match(source, /margin: 2px auto 18px !important/)
  assert.match(source, /min-height: 34px !important/)
})

test('class top segment pill uses the exact bottom nav indicator material tokens', () => {
  const source = patchPreviewClassTopSegmentStyleSource('', '/workspace/src/styles.css')
  assert.match(source, /\.class-top-segment-pill \{[\s\S]*background: var\(--nav-indicator-surface\) !important/)
  assert.match(source, /opacity: 1 !important/)
  assert.match(source, /inset 0 1px 0 var\(--specular-edge\)/)
  assert.match(source, /inset 0 0 0 0\.75px var\(--nav-indicator-edge\)/)
  assert.match(source, /var\(--nav-indicator-shadow\) !important/)
})

test('vite applies style refinement after the class top segment structure patch', () => {
  const vite = read('vite.config.js')
  const structure = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const style = vite.indexOf('patchPreviewClassTopSegmentStyleSource(next, cleanId)')
  assert.ok(structure >= 0)
  assert.ok(style > structure)
})
