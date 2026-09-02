import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study bottom navigation uses an unmistakable minimal open-book icon', () => {
  let source = read('src/main.jsx')
  source = patchPreviewStationNavSource(source, '/workspace/src/main.jsx')
  source = patchStudyVisualPolishSource(source, '/workspace/src/main.jsx')

  assert.match(source, /M3\.3 5\.8c3\.1-\.7 6 \.2 8\.7 2\.4/)
  assert.match(source, /M20\.7 5\.8c-3\.1-\.7-6 \.2-8\.7 2\.4/)
  assert.match(source, /M12 8\.2v10\.9/)
  assert.doesNotMatch(source, /M4\.2 5\.1h5\.5/)
})

test('study header uses neutral study-specific copy instead of the V2 product label', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  assert.match(source, /<p className="eyebrow">공부 기록<\/p>/)
  assert.doesNotMatch(source, /<p className="eyebrow">S-Hub V2<\/p>/)
})

test('study visual polish runs after production recovery so behavior fixes remain authoritative', () => {
  const vite = read('vite.config.js')
  const recovery = vite.indexOf('patchProductionRecoverySource(next, cleanId)')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  assert.ok(recovery >= 0)
  assert.ok(visual > recovery)
})
