import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchProductionRecoverySource } from '../src/production-recovery-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('social dispatch shares activity endpoint and accepts isolated preview or production class identities', () => {
  const source = read('push-backend-v2/api/activity-dispatch.js')
  assert.match(source, /body\.kind === 'board-post' \|\| body\.kind === 'study-start'/)
  assert.match(source, /\^\(\?:preview-\)\?class-/)
  assert.match(source, /verifyBoardPost/)
  assert.match(source, /authorStudentKey/)
  assert.match(source, /withinFreshWindow/)
  assert.match(source, /verifyStudyStart/)
  assert.match(source, /Math\.abs\(actualStartedAt - startedAt\) > 1500/)
  assert.match(source, /pushDispatchClaims/)
  assert.match(source, /subscription\.studentKey !== actorStudentKey/)
  assert.match(source, /reminderActivityRecipientEligible/)
})

test('production social client is rewritten to the canonical production backend', () => {
  const source = read('src/preview-social-push.js')
  const built = patchProductionRecoverySource(source, '/workspace/src/preview-social-push.js')
  assert.match(built, /school-reminder-backend\.vercel\.app\/api\/activity-dispatch/)
  assert.doesNotMatch(built, /school-reminder-backend-git-preview-s-hub-v2/)
  const rebuilt = patchProductionRecoverySource(built, '/workspace/src/preview-social-push.js')
  assert.equal(rebuilt, built)
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

test('notification click routing delegates V2 nested destinations to the shared semantic owner', () => {
  const routing = read('public/notification-routing.js')
  const navigation = read('public/s-hub-navigation.js')
  const sw = read('public/sw.js')

  assert.match(routing, /SHubNavigation\?\.navigate\(tab\)/)
  assert.doesNotMatch(routing, /new MutationObserver/)
  assert.doesNotMatch(routing, /\.click\(\)/)

  assert.match(navigation, /board:\s*\{ tab: 'class', section: 'board' \}/)
  assert.match(navigation, /todo:\s*\{ tab: 'schedule', section: 'todo' \}/)
  assert.match(navigation, /academic:\s*\{ tab: 'schedule', section: 'academic' \}/)
  assert.match(navigation, /meal:\s*\{ tab: 'schedule', section: 'meal' \}/)
  assert.match(navigation, /study:\s*\{ tab: 'study' \}/)

  assert.match(sw, /\?tab=board/)
  assert.match(sw, /\?tab=study/)
  assert.match(sw, /'board', 'study'/)
})

test('Vercel config keeps social push inside the existing activity function', () => {
  const config = JSON.parse(read('push-backend-v2/vercel.json'))
  assert.equal(config.functions['api/activity-dispatch.js']?.maxDuration, 30)
  assert.equal(config.functions['api/social-dispatch.js'], undefined)
  assert.equal(fs.existsSync(new URL('../push-backend-v2/api/social-dispatch.js', import.meta.url)), false)
})
