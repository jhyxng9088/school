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

test('study unread keeps a server-shared seen marker with an offline local cache', () => {
  const source = read('src/preview-study-unread.js')
  const client = read('src/preview-study-client.js')

  assert.match(source, /STORAGE_PREFIX = 'school\.studyUnread\.v2:'/)
  assert.match(source, /eventCursor/)
  assert.match(source, /loadPreviewStudyEvents\(\{ since: controller\.state\.eventCursor \}\)/)
  assert.match(source, /applyServerReadState\(controller, firstPage\.readState/)
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

test('server read state replaces stale per-device Study history while keeping live class starts', () => {
  const source = read('src/preview-study-unread.js')
  const apply = source.slice(source.indexOf('function applyServerReadState'), source.indexOf('function hasPendingWrite'))
  assert.match(apply, /readState\?\.initialized !== true/)
  assert.match(apply, /Number\(readState\.seenAt \|\| 0\)/)
  assert.match(apply, /Number\(readState\.latestAt \|\| 0\)/)
  assert.match(apply, /Number\(currentLatest \|\| 0\)/)
  assert.match(apply, /controller\.state\.eventCursor = nextCursor/)
  assert.doesNotMatch(apply, /Math\.max\(\s*controller\.state\.latestAt/)
})
