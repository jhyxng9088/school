import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preview study replaces the station placeholder without changing production main source', () => {
  const original = read('src/main.jsx')
  const station = patchPreviewStationNavSource(original, '/workspace/src/main.jsx')
  const patched = patchPreviewStudySource(station, '/workspace/src/main.jsx')

  assert.doesNotMatch(original, /preview-study\.jsx/)
  assert.match(patched, /import \{ PreviewStudyPage as PreviewStudyFeaturePage \} from '\.\/preview-study\.jsx'/)
  assert.match(patched, /function PreviewStudyPage\(\{ requireOnline \}\)/)
  assert.match(patched, /study: <PreviewStudyPage requireOnline=\{requireOnline\} \/>/)
  assert.doesNotMatch(patched, /스터디 기능을 넣을 자리만 먼저 확보했어/)
})

test('preview study client is isolated to the dedicated study endpoint', () => {
  const client = read('src/preview-study-client.js')
  assert.match(client, /functions\/v1\/class-study/)
  assert.match(client, /ensureSignedIn/)
  assert.match(client, /cache: 'no-store'/)
})

test('preview study realtime reuses the authenticated class topic and a separate event', () => {
  const realtime = read('src/preview-study-realtime.js')
  assert.match(realtime, /functions\/v1\/board-realtime/)
  assert.match(realtime, /events\/study_changed/)
  assert.match(realtime, /broadcast\?\.event !== 'study_changed'/)
  assert.match(realtime, /self: false/)
})

test('study page includes start, stop, live classmates and today totals', () => {
  const page = read('src/preview-study.jsx')
  assert.match(page, /공부 시작/)
  assert.match(page, /공부 종료/)
  assert.match(page, /지금 공부 중/)
  assert.match(page, /오늘 공부 시간/)
  assert.match(page, /runningTodaySeconds/)
})
