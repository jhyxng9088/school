import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study start is recorded before best-effort push dispatch', () => {
  const source = read('src/preview-study-client.js')
  assert.match(source, /STUDY_EVENTS_API_URL/)
  assert.match(source, /export async function recordPreviewStudyStartEvent/)
  const start = source.slice(source.indexOf('export async function startPreviewStudy'), source.indexOf('export async function pausePreviewStudy'))
  assert.match(start, /await recordPreviewStudyStartEvent\(response\.active\)/)
  assert.ok(start.indexOf('await recordPreviewStudyStartEvent(response.active)') < start.indexOf('dispatchPreviewStudyStartPush(response.active)'))
})

test('study unread has one event owner with a shared seen cursor and offline local cache', () => {
  const source = read('src/preview-study-unread.js')
  const client = read('src/preview-study-client.js')

  assert.match(source, /STORAGE_PREFIX = 'school\.studyUnread\.v2:'/)
  assert.match(source, /hasUnread/)
  assert.match(source, /eventCursor/)
  assert.match(source, /seenCursor/)
  assert.match(source, /loadPreviewStudyEvents\(\{ since: controller\.state\.seenCursor \}\)/)
  assert.doesNotMatch(source, /\bloadPreviewStudy\(/)
  assert.match(source, /applyServerReadState\(controller, firstPage\.readState, latestCursor\)/)
  assert.match(source, /pendingSeenAt/)
  assert.match(source, /pendingSeenCursor/)
  assert.match(source, /async function flushPending\(controller\)/)
  assert.match(source, /savePreviewStudySeen\(seenAt, seenCursor\)/)
  assert.match(source, /window\.addEventListener\('online', controller\.onResume\)/)
  assert.match(source, /document\.addEventListener\('visibilitychange', controller\.onResume\)/)

  assert.match(client, /function normalizeStudyReadState\(value\)/)
  assert.match(client, /readState: normalizeStudyReadState\(body\?\.readState\)/)
  assert.match(client, /export async function savePreviewStudySeen/)
  assert.match(client, /action: 'mark-seen'/)
})

test('server Study state cannot roll a locally advanced seen cursor backward or resurrect an old dot', () => {
  const source = read('src/preview-study-unread.js')
  const apply = source.slice(source.indexOf('function applyServerReadState'), source.indexOf('function hasPendingWrite'))
  const snap = source.slice(source.indexOf('function snapshot'), source.indexOf('function notify'))

  assert.match(apply, /readState\?\.initialized !== true/)
  assert.match(apply, /Number\(controller\.state\.seenAt \|\| 0\)/)
  assert.match(apply, /Number\(controller\.state\.seenCursor \|\| 0\)/)
  assert.match(apply, /Number\(readState\.seenCursor \|\| 0\)/)
  assert.match(apply, /const nextHasUnread = serverLatestAt > 0 && nextEventCursor > nextSeenCursor/)
  assert.match(apply, /controller\.state\.seenCursor = nextSeenCursor/)
  assert.match(apply, /controller\.state\.eventCursor = nextEventCursor/)
  assert.match(apply, /controller\.state\.hasUnread = nextHasUnread/)
  assert.match(snap, /hasUnread: controller\.state\.initialized && Boolean\(controller\.state\.hasUnread\)/)
  assert.doesNotMatch(snap, /latestAt > seenAt/)
})

test('opening Study clears only the rendered cursor before the shared seen write finishes', () => {
  const source = read('src/preview-study-unread.js')
  const target = source.slice(source.indexOf('function boundedSeenTarget'), source.indexOf('function markControllerSeen'))
  const markSeen = source.slice(source.indexOf('function markControllerSeen'), source.indexOf('function consumeDeferredSeen'))

  assert.match(target, /seenAt: Math\.min\(currentAt/)
  assert.match(target, /seenCursor: Math\.min\(currentCursor/)
  assert.match(markSeen, /!controller\.state\.initialized \|\| !controller\.state\.hasUnread/)
  assert.match(markSeen, /const next = boundedSeenTarget\(controller, target\)/)
  assert.match(markSeen, /controller\.state\.seenCursor = Math\.max\(Number\(controller\.state\.seenCursor \|\| 0\), next\.seenCursor\)/)
  assert.match(markSeen, /controller\.state\.pendingSeenCursor = Math\.max/)
  assert.match(markSeen, /controller\.state\.hasUnread = Number\(controller\.state\.eventCursor \|\| 0\) > Number\(controller\.state\.seenCursor \|\| 0\)/)
  assert.ok(markSeen.indexOf('controller.state.hasUnread = Number') < markSeen.indexOf('void flushPending(controller)'))
})

test('opening Study during an in-flight unread sync preserves the exact rendered seen target for only that sync', () => {
  const source = read('src/preview-study-unread.js')
  const sync = source.slice(source.indexOf('async function syncController'), source.indexOf('function startController'))
  const markSeen = source.slice(source.indexOf('export function markPreviewStudySeen'), source.indexOf('export function previewStudyUnreadSnapshot'))
  const consume = source.slice(source.indexOf('function consumeDeferredSeen'), source.indexOf('async function syncController'))

  assert.match(sync, /const syncToken = \{\}/)
  assert.match(sync, /controller\.syncToken = syncToken/)
  assert.match(sync, /consumeDeferredSeen\(controller, syncToken\)/)
  assert.match(sync, /controller\.deferredSeen\?\.syncToken === syncToken/)
  assert.match(sync, /controller\.syncToken === syncToken/)

  assert.match(markSeen, /markControllerSeen\(controller, target\)/)
  assert.match(markSeen, /const queueDeferred = \(syncToken\) =>/)
  assert.match(markSeen, /controller\.deferredSeen = \{ syncToken, target \}/)
  assert.match(markSeen, /if \(controller\.syncToken\)/)
  assert.match(markSeen, /void syncController\(controller\)/)
  assert.doesNotMatch(markSeen, /addEventListener|setTimeout|setInterval/)

  assert.match(consume, /deferred\?\.syncToken !== syncToken/)
  assert.match(consume, /controller\.deferredSeen = null/)
  assert.match(consume, /markControllerSeen\(controller, deferred\.target\)/)
})