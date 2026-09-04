import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewFastCacheSource } from '../src/preview-fast-cache-patch.js'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board GET retry is owned by the checked-in client source', () => {
  const source = read('src/preview-board-client.js')
  const patchSource = read('src/preview-board-patch.js')
  const id = '/workspace/src/preview-board-client.js'
  const afterFastCache = patchPreviewFastCacheSource(source, id)
  const afterBoard = patchPreviewBoardSource(afterFastCache, id)

  assert.match(source, /const BOARD_GET_RETRY_DELAYS = \[0, 180, 420\]/)
  assert.match(source, /const delays = method === 'GET' \? BOARD_GET_RETRY_DELAYS : \[0\]/)
  assert.match(source, /response\.status >= 500/)
  assert.match(source, /error\?\.name === 'AbortError'/)
  assert.equal(afterBoard, afterFastCache)
  assert.doesNotMatch(patchSource, /patchBoardClientRetry/)
  assert.doesNotMatch(patchSource, /endsWith\('\/preview-board-client\.js'\)/)
})
