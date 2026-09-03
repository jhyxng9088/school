import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewBoardAllSource } from '../src/preview-board-all-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board 전체 is a virtual dotless aggregate filter, not a writable section', () => {
  const source = patchPreviewBoardAllSource(read('src/preview-board-complete.jsx'), '/src/preview-board-complete.jsx')

  assert.match(source, /const ALL_BOARD_SECTION = \{ id: 'all', label: '전체', color: '', builtin: true/)
  assert.match(source, /\{\[ALL_BOARD_SECTION, \.\.\.sections\]\.map/)
  assert.match(source, /useState\('all'\)/)
  assert.match(source, /if \(sectionId === ALL_BOARD_SECTION\.id\) return ALL_BOARD_SECTION/)
  assert.match(source, /if \(!section\?\.color\) return null/)
  assert.match(source, /initialSectionId=\{activeSectionId === 'all' \? 'general' : activeSectionId\}/)
  assert.doesNotMatch(source, /createPreviewBoardSection\('전체'/)
})

test('aggregate board GET uses one dedicated read endpoint and preserves existing write API', () => {
  const source = patchPreviewBoardAllSource(read('src/preview-board-client.js'), '/src/preview-board-client.js')

  assert.match(source, /BOARD_ALL_API_URL = 'https:\/\/elhlsqhzjmsfhmawrpqu\.supabase\.co\/functions\/v1\/class-board-all'/)
  assert.match(source, /const aggregateGet = method === 'GET' && sectionId === 'all'/)
  assert.match(source, /new URL\(aggregateGet \? BOARD_ALL_API_URL : BOARD_API_URL\)/)
  assert.match(source, /method === 'GET' && sectionId && !aggregateGet/)
  assert.match(source, /requestBoard\(\{ method: 'POST'/)
})

test('aggregate board keeps posts visible when their category changes or new posts are added', () => {
  const source = patchPreviewBoardAllSource(read('src/preview-board-complete.jsx'), '/src/preview-board-complete.jsx')

  assert.match(source, /activeSectionId !== 'all' && updated\.sectionId !== activeSectionId/)
  assert.match(source, /activeSectionId !== 'all' && post\.sectionId !== activeSectionId/)
  assert.match(source, /const moved = activeSectionId !== 'all' && updated\.sectionId !== activeSectionId/)
})

test('board post detail keeps its data mounted while the unified sheet plays the close transition', () => {
  const source = patchPreviewBoardAllSource(read('src/preview-board-complete.jsx'), '/src/preview-board-complete.jsx')
  const unifiedSheet = read('src/unified-sheet.jsx')

  assert.match(source, /const \[retainedDetailPost, setRetainedDetailPost\] = useState\(null\)/)
  assert.match(source, /posts\.find\(\(post\) => post\.id === detailPostId\) \|\| retainedDetailPost/)
  assert.match(source, /setRetainedDetailPost\(post\); setDetailPostId\(post\.id\)/)
  assert.match(source, /open=\{Boolean\(detailPostId && detailPost\)\}/)
  assert.doesNotMatch(source, /<BoardDetail[^\n]+open=\{Boolean\(detailPost\)\}/)
  assert.match(unifiedSheet, /setClosing\(true\)[\s\S]*setVisualOpen\(false\)[\s\S]*setTimeout\(\(\) => \{[\s\S]*setRendered\(false\)/)
})

test('board aggregate patch restores the React useRef binding before browser bundling', () => {
  const source = [
    "import { useCallback, useEffect, useMemo, useState } from 'react'",
    'const orphanedRef = useRef(false)',
    'const ALL_BOARD_SECTION = {}',
  ].join('\n')
  const output = patchPreviewBoardAllSource(source, '/src/preview-board-complete.jsx')

  assert.match(output, /import \{ useCallback, useEffect, useMemo, useRef, useState \} from 'react'/)
  assert.match(output, /orphanedRef = useRef\(false\)/)
})

test('legacy React board nav markers use section-seen semantics, matching the unified unread engine', () => {
  const input = "hasBoardUnread={boardUnread.hasUnread}\n" +
    "tab.id === 'class' && boardUnread.hasUnread ? 'has-board-unread' : ''"
  const output = patchPreviewBoardAllSource(input, '/src/main.jsx')

  assert.match(output, /hasBoardUnread=\{boardUnread\.hasSectionUnread\}/)
  assert.match(output, /boardUnread\.hasSectionUnread \? 'has-board-unread'/)
  assert.doesNotMatch(output, /boardUnread\.hasUnread/)
})
