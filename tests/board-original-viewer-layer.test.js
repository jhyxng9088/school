import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board attachment original uses the shared viewer above the unified post sheet', () => {
  const source = read('src/preview-board-attachments.jsx')
  const transformed = patchPreviewBoardSource(source, '/workspace/src/preview-board-attachments.jsx')
  const patchSource = read('src/preview-board-patch.js')
  const sharedViewer = read('src/original-file-viewer.jsx')
  const unifiedSheet = read('src/unified-sheet.css')

  assert.doesNotMatch(source, /preview-board-original-layer\.css/)
  assert.match(source, /import \{ OriginalFileViewer \} from '\.\/original-file-viewer\.jsx'/)
  assert.match(source, /<OriginalFileViewer[\s\S]*?portal[\s\S]*?zIndex=\{10030\}/)
  assert.doesNotMatch(source, /function BoardOriginalViewer/)
  assert.equal(transformed, source)
  assert.doesNotMatch(patchSource, /patchBoardAttachmentViewer/)
  assert.doesNotMatch(patchSource, /endsWith\('\/preview-board-attachments\.jsx'\)/)
  assert.match(sharedViewer, /zIndex = null/)
  assert.match(sharedViewer, /style=\{zIndex == null \? undefined : \{ zIndex \}\}/)
  assert.match(sharedViewer, /return createPortal\(content, document\.body\)/)
  assert.match(unifiedSheet, /z-index: 10010 !important/)
  assert.equal(fs.existsSync(new URL('../src/preview-board-original-layer.css', import.meta.url)), false)
  assert.ok(10030 > 10010)
})
