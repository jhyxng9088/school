import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pushClient = fs.readFileSync(new URL('../src/push-client.js', import.meta.url), 'utf8')
const scheduled = fs.readFileSync(new URL('../push-backend-v2/api/reminder-scheduled.js', import.meta.url), 'utf8')

test('push subscription migration keeps Firestore primary and mirrors only after a successful canonical write', () => {
  const storeAt = pushClient.indexOf("doc(db, 'classes', identity.classId, 'pushSubscriptions'")
  const mirrorAt = pushClient.indexOf('void mirrorPushSubscription(identity, subscriptionPayload)')
  assert.ok(storeAt >= 0)
  assert.ok(mirrorAt > storeAt)
  assert.match(pushClient, /const subscriptionPayload = \{[\s\S]*studentKey: identity\.studentKey[\s\S]*deviceId: currentDeviceId[\s\S]*endpoint,[\s\S]*p256dh,[\s\S]*auth,[\s\S]*updatedAt,/)
  assert.match(pushClient, /await setDoc\([\s\S]*subscriptionPayload,[\s\S]*\{ merge: true \},[\s\S]*\)[\s\S]*void mirrorPushSubscription/)
})

test('Supabase mirror failure can never fail the existing Firestore registration path', () => {
  const start = pushClient.indexOf('async function mirrorPushSubscription')
  const end = pushClient.indexOf('\nasync function ensurePushSubscription', start)
  assert.ok(start >= 0 && end > start)
  const body = pushClient.slice(start, end)
  assert.match(body, /window\.setTimeout\(\(\) => controller\.abort\(\), 2200\)/)
  assert.match(body, /keepalive: true/)
  assert.match(body, /if \(!response\.ok\)[\s\S]*return false/)
  assert.match(body, /catch \(error\)[\s\S]*return false/)
  assert.doesNotMatch(body, /throw new Error/)
})

test('scheduled notifications still read Firestore subscriptions until mirror parity is proven', () => {
  assert.match(scheduled, /db\.collectionGroup\('pushSubscriptions'\)\.get\(\)/)
  assert.doesNotMatch(scheduled, /push_subscriptions_mirror/)
})

test('push mirror uses the authenticated S-Hub Supabase Edge Function', () => {
  assert.match(pushClient, /https:\/\/elhlsqhzjmsfhmawrpqu\.supabase\.co\/functions\/v1\/push-subscription-mirror/)
  assert.match(pushClient, /authorization: `Bearer \$\{idToken\}`/)
  assert.match(pushClient, /body: JSON\.stringify\(\{[\s\S]*\.\.\.payload,[\s\S]*classId: identity\.classId/)
})
