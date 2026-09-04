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

test('board unread uses a student-shared server owner while preserving local fallback', () => {
  const unread = read('src/preview-board-unread.js')
  const shared = read('src/preview-board-read-state.js')

  assert.match(shared, /functions\/v1\/board-read-state/)
  assert.match(shared, /export async function loadPreviewBoardReadState/)
  assert.match(shared, /export async function initializePreviewBoardReadState/)
  assert.match(shared, /export async function markPreviewBoardSectionSeenShared/)
  assert.match(shared, /export async function markPreviewBoardPostReadShared/)

  assert.match(unread, /async function syncSharedController\(controller\)/)
  assert.match(unread, /unread: Object\.values\(controller\.state\.unread\)/)
  assert.match(unread, /applySharedSnapshot\(controller, shared\)/)
  assert.match(unread, /controller\.sharedReady = true/)
  assert.match(unread, /if \(!controller\.sharedReady \|\| readCursor <= 0\) return/)
  assert.match(unread, /markPreviewBoardPostReadShared\(id, readCursor\)/)
  assert.match(unread, /markPreviewBoardSectionSeenShared\(cursor\)/)
  assert.match(unread, /using local fallback/)
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
  assert.match(patch, /hasBoardUnread=\{boardUnread\.hasSectionUnread\}/)
  assert.match(patch, /tab\.id === 'class' && boardUnread\.hasSectionUnread/)
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
  assert.match(aiPatch, /tab\.id === 'class' && boardUnread\.hasSectionUnread \? 'has-board-unread' : ''/)
  assert.match(aiPatch, /tab\.id === 'ai' && aiWorking \? 'is-ai-working' : ''/)
  assert.match(aiPatch, /s-hub-ai-nav-progress/)
})
