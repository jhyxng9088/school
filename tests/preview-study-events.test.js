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

test('study unread persists a server cursor and catches up missed start events', () => {
  const source = read('src/preview-study-unread.js')
  assert.match(source, /eventCursor/)
  assert.match(source, /loadPreviewStudyEvents\(\{ since: controller\.state\.eventCursor \}\)/)
  assert.match(source, /latestOtherEvent\(firstPage\.events, controller\.identityKey\)/)
  assert.match(source, /while \(page\.hasMore/)
  assert.match(source, /window\.addEventListener\('online', controller\.onResume\)/)
  assert.match(source, /document\.addEventListener\('visibilitychange', controller\.onResume\)/)
})

test('first study unread event sync establishes a baseline instead of flagging old history', () => {
  const source = read('src/preview-study-unread.js')
  const baseline = source.slice(source.indexOf('if (!controller.state.initialized)'), source.indexOf('let cursor = controller.state.eventCursor'))
  assert.match(baseline, /eventCursor = Math\.max\(0, Number\(firstPage\.latestCursor/)
  assert.match(baseline, /latestAt = currentLatest/)
  assert.match(baseline, /seenAt = currentLatest/)
  assert.doesNotMatch(baseline, /latestOtherEvent/)
})
