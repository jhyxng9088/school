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
  const layer = read('src/preview-board-original-layer.css')
  const unifiedSheet = read('src/unified-sheet.css')

  assert.match(source, /import '\.\/preview-board-original-layer\.css'/)
  assert.match(source, /import \{ OriginalFileViewer \} from '\.\/original-file-viewer\.jsx'/)
  assert.match(source, /<OriginalFileViewer[\s\S]*?portal/)
  assert.doesNotMatch(source, /function BoardOriginalViewer/)
  assert.equal(transformed, source)
  assert.doesNotMatch(patchSource, /patchBoardAttachmentViewer/)
  assert.doesNotMatch(patchSource, /endsWith\('\/preview-board-attachments\.jsx'\)/)
  assert.match(sharedViewer, /return createPortal\(content, document\.body\)/)
  assert.match(layer, /\.reminder-original-viewer\s*\{[\s\S]*z-index:\s*10030;/)
  assert.match(unifiedSheet, /z-index: 10010 !important/)
  assert.ok(10030 > 10010)
})
