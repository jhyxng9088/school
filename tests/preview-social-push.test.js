import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('social dispatch is preview scoped, server verified, deduplicated, and excludes actor', () => {
  const source = read('push-backend-v2/api/social-dispatch.js')
  assert.match(source, /\^preview-class-/)
  assert.match(source, /verifyBoardPost/)
  assert.match(source, /authorStudentKey/)
  assert.match(source, /withinFreshWindow/)
  assert.match(source, /verifyStudyStart/)
  assert.match(source, /Math\.abs\(actualStartedAt - startedAt\) > 1500/)
  assert.match(source, /pushDispatchClaims/)
  assert.match(source, /subscription\.studentKey !== actorStudentKey/)
})

test('board sends push only for new post realtime mutation', () => {
  const source = read('src/preview-board-realtime.js')
  assert.match(source, /safe\.kind === 'post'/)
  assert.match(source, /dispatchPreviewBoardPostPush/)
  assert.doesNotMatch(source, /safe\.kind === 'board'.*dispatchPreviewBoardPostPush/s)
})

test('study sends push on start but not pause resume or stop', () => {
  const source = read('src/preview-study-client.js')
  const start = source.slice(source.indexOf('export async function startPreviewStudy'), source.indexOf('export async function pausePreviewStudy'))
  const rest = source.slice(source.indexOf('export async function pausePreviewStudy'))
  assert.match(start, /dispatchPreviewStudyStartPush/)
  assert.doesNotMatch(rest, /dispatchPreviewStudyStartPush/)
})

test('notification click routing knows V2 nested board schedule and study destinations', () => {
  const routing = read('public/notification-routing.js')
  const sw = read('public/sw.js')
  assert.match(routing, /board: 'class'/)
  assert.match(routing, /todo: 'schedule'/)
  assert.match(routing, /academic: 'schedule'/)
  assert.match(routing, /meal: 'schedule'/)
  assert.match(routing, /tab === 'study'/)
  assert.match(sw, /\?tab=board/)
  assert.match(sw, /\?tab=study/)
  assert.match(sw, /'board', 'study'/)
})

test('Vercel config includes the social dispatcher', () => {
  const config = JSON.parse(read('push-backend-v2/vercel.json'))
  assert.equal(config.functions['api/social-dispatch.js']?.maxDuration, 30)
})
