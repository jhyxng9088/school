import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board first GET retries transient server failures without retrying writes', () => {
  const patch = read('src/preview-board-patch.js')
  assert.match(patch, /BOARD_GET_RETRY_DELAYS = \[0, 180, 420\]/)
  assert.match(patch, /const delays = method === 'GET' \? BOARD_GET_RETRY_DELAYS : \[0\]/)
  assert.match(patch, /response\.status >= 500/)
  assert.match(patch, /signal\?\.aborted/)
})

test('board unread state baselines once, catches up by server cursor, and persists per student', () => {
  const unread = read('src/preview-board-unread.js')
  assert.match(unread, /STORAGE_PREFIX = 'school\.boardUnread\.v2:'/)
  assert.match(unread, /studentKeyFor\(profile\)/)
  assert.match(unread, /loadPreviewBoardEvents\(null\)/)
  assert.match(unread, /loadPreviewBoardEvents\(cursor\)/)
  assert.match(unread, /localStorage\.setItem/)
  assert.match(unread, /function markPostReadFor\(controller, postId\)/)
  assert.match(unread, /delete next\[id\]/)
})

test('board realtime supports global unread and visible-board refresh listeners at the same time', () => {
  const realtime = read('src/preview-board-realtime.js')
  assert.match(realtime, /const listeners = new Set\(\)/)
  assert.match(realtime, /export async function loadPreviewBoardEvents\(since = null\)/)
  assert.match(realtime, /listeners\.add\(onChange\)/)
  assert.match(realtime, /if \(!listeners\.size && socketState\) stopSocketState\(socketState\)/)
  assert.doesNotMatch(realtime, /if \(socketState\) stopSocketState\(socketState\)\n  const state/)
})

test('board unread UI reaches class nav, board segment, and changed post cards', () => {
  const patch = read('src/preview-board-patch.js')
  const css = read('src/preview-board-unread.css')
  assert.match(patch, /const boardUnread = usePreviewBoardUnread\(profile\)/)
  assert.match(patch, /hasBoardUnread=\{boardUnread\.hasUnread\}/)
  assert.match(patch, /tab\.id === 'class' && boardUnread\.hasUnread/)
  assert.match(patch, /boardUnread\.isPostUnread\(post\.id\)/)
  assert.match(patch, /boardUnread\.markPostRead\(post\.id\)/)
  assert.match(patch, /preview-board-unread-dot/)
  assert.match(css, /nav-button\[data-tab="class"\]\.has-board-unread/)
  assert.match(css, /class-top-segment-button\.has-board-unread/)
  assert.match(css, /preview-board-card\.has-unread/)
})

test('an already open post stays read when a realtime comment or edit arrives', () => {
  const patch = read('src/preview-board-patch.js')
  assert.match(patch, /if \(!detailPostId \|\| !boardUnread\.isPostUnread\(detailPostId\)\) return/)
  assert.match(patch, /boardUnread\.markPostRead\(detailPostId\)/)
  assert.match(patch, /\[detailPostId, boardUnread\.revision\]/)
})

test('AI working state keeps board unread class when both nav indicators are active', () => {
  const aiPatch = read('src/preview-ai-background-patch.js')
  assert.match(aiPatch, /boardUnreadNavMarker/)
  assert.match(aiPatch, /tab\.id === 'class' && boardUnread\.hasUnread \? 'has-board-unread' : ''/)
  assert.match(aiPatch, /tab\.id === 'ai' && aiWorking \? 'is-ai-working' : ''/)
  assert.match(aiPatch, /s-hub-ai-nav-progress/)
})
