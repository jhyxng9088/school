import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/push-client.js', import.meta.url), 'utf8')

test('notification prompt is offered whenever permission is not granted', () => {
  assert.match(source, /Notification\.permission === 'granted'\) return/)
  assert.doesNotMatch(source, /PROMPT_SESSION_KEY|school\.pushPromptSeen|sessionStorage\.getItem/)
  assert.match(source, /permissionDenied = Notification\.permission === 'denied'/)
  assert.match(source, /기기 설정에서 S-Hub 알림을 허용해줘/)
})

test('returning to the app offers the prompt again and refreshes granted subscriptions', () => {
  assert.match(source, /function installPermissionPromptEntryWatcher\(profile\)/)
  assert.match(source, /document\.addEventListener\('visibilitychange', refreshPermissionState\)/)
  assert.match(source, /if \(document\.hidden\) \{\n\s+leftApp = true/)
  assert.match(source, /if \(Notification\.permission === 'granted'\) \{[\s\S]*ensurePushSubscription\(profile\)/)
  assert.match(source, /installPermissionPromptEntryWatcher\(profile\)/)
  assert.match(source, /else \{\n\s+maybeShowPermissionPrompt\(profile\)/)
})
