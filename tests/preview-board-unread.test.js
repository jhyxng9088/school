import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('board first GET retries transient server failures without retrying writes', () => {
  const client = read('src/preview-board-client.js')
  assert.match(client, /BOARD_GET_RETRY_DELAYS = \[0, 180, 420\]/)
  assert.match(client, /const delays = method === 'GET' \? BOARD_GET_RETRY_DELAYS : \[0\]/)
  assert.match(client, /response\.status >= 500/)
  assert.match(client, /signal\?\.aborted/)
})

test('board unread uses student-scoped server state with local cache and retryable read writes', () => {
  const unread = read('src/preview-board-unread.js')
  const realtime = read('src/preview-board-realtime.js')

  assert.match(unread, /STORAGE_PREFIX = 'school\.boardUnread\.v3:'/)
  assert.match(unread, /studentKeyFor\(profile\)/)
  assert.match(unread, /result\.readState/)
  assert.match(unread, /function applyServerReadState\(controller, readState\)/)
  assert.match(unread, /pendingReads/)
  assert.match(unread, /pendingSeenCursor/)
  assert.match(unread, /async function flushPending\(controller\)/)
  assert.match(unread, /localStorage\.setItem/)
  assert.match(unread, /savePreviewBoardPostRead\(postId, readCursor\)/)
  assert.match(unread, /savePreviewBoardSectionSeen\(pendingSeenCursor\)/)
  assert.match(unread, /function markPostReadFor\(controller, postId\)/)
  assert.match(unread, /delete next\[id\]/)

  assert.match(realtime, /readState: body\?\.readState \? normalizeReadState\(body\.readState\) : null/)
  assert.match(realtime, /export async function savePreviewBoardPostRead/)
  assert.match(realtime, /action: 'mark-post-read'/)
  assert.match(realtime, /export async function savePreviewBoardSectionSeen/)
  assert.match(realtime, /action: 'mark-section-seen'/)
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
  const boardCss = read('src/preview-board-unread.css')
  const unified = read('src/unread-indicators-v2.js')
  const unifiedCss = read('src/unread-indicators.css')

  assert.match(patch, /const boardUnread = usePreviewBoardUnread\(profile\)/)
  assert.match(patch, /hasBoardUnread=\{boardUnread\.hasUnread\}/)
  assert.match(patch, /tab\.id === 'class' && boardUnread\.hasUnread/)
  assert.match(patch, /boardUnread\.isPostUnread\(post\.id\)/)
  assert.match(patch, /boardUnread\.markPostRead\(post\.id\)/)
  assert.match(patch, /preview-board-unread-dot/)
  assert.match(boardCss, /preview-board-card\.has-unread/)

  assert.match(unified, /if \(tab === 'board'\) return state\.boardUnread/)
  assert.match(unified, /if \(tab === 'class'\) return navUnread\('timetable'\) \|\| navUnread\('board'\)/)
  assert.match(unified, /renderTopSegments\(\)/)
  assert.match(unified, /renderNav\(\)/)
  assert.match(unified, /addDot\(button, 'segment'\)/)
  assert.match(unified, /addDot\(button, 'nav'\)/)
  assert.match(unifiedCss, /\.bottom-nav \.nav-button/)
  assert.match(unifiedCss, /\.class-top-segment-button\[data-unread-key\]/)
  assert.match(unifiedCss, /\.school-unread-dot\.is-nav/)
  assert.match(unifiedCss, /\.school-unread-dot\.is-segment/)
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
