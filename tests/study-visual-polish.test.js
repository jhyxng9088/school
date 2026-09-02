import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study bottom navigation uses an unmistakable minimal stopwatch icon', () => {
  let source = read('src/main.jsx')
  source = patchPreviewStationNavSource(source, '/workspace/src/main.jsx')
  source = patchStudyVisualPolishSource(source, '/workspace/src/main.jsx')

  assert.match(source, /<circle cx="12" cy="13" r="7\.2"\/>/)
  assert.match(source, /M12 9\.3v4l2\.6 1\.6/)
  assert.match(source, /M9\.4 3\.5h5\.2/)
  assert.doesNotMatch(source, /M4\.2 5\.1h5\.5/)
  assert.doesNotMatch(source, /M3\.3 5\.8c3\.1-\.7/)
})

test('study header uses neutral study-specific copy instead of the V2 product label', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  assert.match(source, /<p className="eyebrow">공부 기록<\/p>/)
  assert.doesNotMatch(source, /<p className="eyebrow">S-Hub V2<\/p>/)
})

test('board and AI hero descriptions keep Korean words intact when wrapping', () => {
  const boardCss = patchStudyVisualPolishSource(read('src/preview-board.css'), '/workspace/src/preview-board.css')
  assert.match(boardCss, /\.preview-board-header-note \{[\s\S]*word-break: keep-all;[\s\S]*overflow-wrap: break-word;/)

  let aiCss = patchPreviewAIPageSource(read('src/s-hub-ai.css'), '/workspace/src/s-hub-ai.css')
  aiCss = patchStudyVisualPolishSource(aiCss, '/workspace/src/s-hub-ai.css')
  assert.match(aiCss, /\.s-hub-ai-page-title p:last-child \{[\s\S]*word-break: keep-all;[\s\S]*overflow-wrap: break-word;/)
})

test('AI hero keeps the S-Hub product name together instead of breaking at the hyphen', () => {
  let source = patchPreviewAIPageSource(read('src/s-hub-ai-sheet.jsx'), '/workspace/src/s-hub-ai-sheet.jsx')
  source = patchStudyVisualPolishSource(source, '/workspace/src/s-hub-ai-sheet.jsx')

  assert.match(source, /찾은 일정을 바로 S‑Hub에 추가할 수 있어요\./)
  assert.doesNotMatch(source, /찾은 일정을 바로 S-Hub에 추가해\./)
})

test('study visual polish runs after production recovery so behavior fixes remain authoritative', () => {
  const vite = read('vite.config.js')
  const recovery = vite.indexOf('patchProductionRecoverySource(next, cleanId)')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  assert.ok(recovery >= 0)
  assert.ok(visual > recovery)
})
