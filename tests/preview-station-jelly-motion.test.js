import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const patch = fs.readFileSync(new URL('../src/preview-station-jelly-motion-patch.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('top-level station tap is dispatched only once after layout motion', () => {
  assert.match(patch, /single top-level tap dispatch/)
  assert.match(patch, /onClick=\{\(\) => changeTab\(tab\.id\)\}/)
  assert.match(patch, /onPointerDown=\{\(event\) => \{\\n\s+if \(event\.pointerType !== 'mouse'\) changeTab\(tab\.id\)/)
  const replacementCount = (patch.match(/`\s+onClick=\{\(\) => changeTab\(tab\.id\)\}`/g) || []).length
  assert.equal(replacementCount, 1)
})

test('class exit overlaps collapse with destination motion', () => {
  assert.match(patch, /\}, 300\)/)
  assert.match(patch, /classExitReleaseTimerRef/)
  assert.match(patch, /\}, 310\)/)
})

test('outer station items and nested class pill use elastic jelly motion', () => {
  assert.match(patch, /station-side-jelly-left/)
  assert.match(patch, /station-side-jelly-right/)
  assert.match(patch, /class-mini-jelly-left/)
  assert.match(patch, /class-mini-jelly-right/)
  assert.match(patch, /scaleX\(1\.12\)/)
})

test('preview vite applies jelly patch after station refinement', () => {
  const refineIndex = vite.indexOf('patchPreviewStationNavRefinementSource(next, cleanId)')
  const jellyIndex = vite.indexOf('patchPreviewStationJellyMotionSource(next, cleanId)')
  assert.ok(refineIndex >= 0)
  assert.ok(jellyIndex > refineIndex)
})
