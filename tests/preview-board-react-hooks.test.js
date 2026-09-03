import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewFastCacheSource } from '../src/preview-fast-cache-patch.js'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board realtime transform preserves React useRef for editor refs', () => {
  const id = '/src/preview-board-complete.jsx'
  let source = patchPreviewFastCacheSource(read('src/preview-board-complete.jsx'), id)
  source = patchPreviewBoardSource(source, id)

  assert.match(source, /import \{ useCallback, useEffect, useMemo, useRef, useState \} from 'react'/)
  assert.doesNotMatch(source, /activityReadyRef = useRef\(false\)/)
  assert.doesNotMatch(source, /lastActivityAtRef = useRef\(0\)/)
})
