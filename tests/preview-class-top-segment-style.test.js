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

test('class top segment pill uses the same opaque surface token as bottom nav indicator', () => {
  const source = patchPreviewClassTopSegmentStyleSource('', '/workspace/src/styles.css')
  assert.match(source, /\.class-top-segment-pill \{[\s\S]*background: var\(--surface\) !important/)
  assert.match(source, /opacity: 1 !important/)
  assert.match(source, /box-shadow: inset 0 0 0 0\.5px var\(--border\) !important/)
})

test('vite applies style refinement after the class top segment structure patch', () => {
  const vite = read('vite.config.js')
  const structure = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const style = vite.indexOf('patchPreviewClassTopSegmentStyleSource(next, cleanId)')
  assert.ok(structure >= 0)
  assert.ok(style > structure)
})
