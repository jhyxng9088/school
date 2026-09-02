import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board attachment original opens above the unified post sheet like reminder originals', () => {
  const source = read('src/preview-board-attachments.jsx')
  const transformed = patchPreviewBoardSource(source, '/workspace/src/preview-board-attachments.jsx')
  const unifiedSheet = read('src/unified-sheet.css')

  assert.match(source, /const BOARD_ORIGINAL_VIEWER_Z_INDEX = 10030/)
  assert.match(source, /style=\{\{ zIndex: BOARD_ORIGINAL_VIEWER_Z_INDEX \}\}/)
  assert.match(transformed, /return createPortal\(/)
  assert.match(transformed, /document\.body/)
  assert.match(unifiedSheet, /z-index: 10010 !important/)
  assert.ok(10030 > 10010)
})
