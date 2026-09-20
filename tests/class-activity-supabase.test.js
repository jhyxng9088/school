import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const activity = fs.readFileSync(new URL('../src/class-activity.js', import.meta.url), 'utf8')
const supabase = fs.readFileSync(new URL('../src/class-activity-supabase.js', import.meta.url), 'utf8')

test('class activity reads Supabase first and starts Firestore listener only as fallback', () => {
  assert.match(activity, /loadSupabaseClassActivity\(normalized\)/)
  assert.match(activity, /subscribeSupabaseClassActivity\(primary\.topic/)
  const fallbackAt = activity.indexOf('const startFirestoreFallback = () =>')
  const snapshotAt = activity.indexOf('onSnapshot(', fallbackAt)
  assert.ok(fallbackAt >= 0)
  assert.ok(snapshotAt > fallbackAt)
  assert.match(activity, /onUnavailable: \(\) => \{[\s\S]*startFirestoreFallback\(\)/)
  assert.match(activity, /onAvailable: \(\) => \{[\s\S]*refreshSupabase\(\)[\s\S]*stopFirestoreFallback\(\)/)
})

test('activity writes preserve Firestore first and Supabase stays a non-blocking replica', () => {
  const commitAt = activity.indexOf('await batch.commit()')
  const mirrorAt = activity.indexOf('void saveSupabaseClassActivities(normalized, mirroredEntries)')
  const eventAt = activity.indexOf('mirroredEntries.forEach((entry) => emitCommittedActivity(entry))')
  assert.ok(commitAt >= 0)
  assert.ok(mirrorAt > commitAt)
  assert.ok(eventAt > mirrorAt)
})

test('Supabase activity client has authenticated load, realtime broadcast and reconnect fallback signals', () => {
  assert.match(supabase, /functions\/v1\/class-activity-mirror/)
  assert.match(supabase, /authorization: await authorization\(\)/)
  assert.match(supabase, /activity_changed/)
  assert.match(supabase, /onUnavailable/)
  assert.match(supabase, /onAvailable/)
  assert.match(supabase, /const recovered = state\.unavailable/)
})

test('failed Supabase activity mirror attempts a realtime broadcast but never removes Firestore ownership', () => {
  assert.match(supabase, /async function broadcastFallback/)
  assert.match(supabase, /Supabase class activity mirror unavailable; Firestore write remains canonical/)
  assert.match(activity, /batch\.set\(activityRef/)
})
