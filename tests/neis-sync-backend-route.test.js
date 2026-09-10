import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/neis-timetable-sync.js', import.meta.url), 'utf8')

test('NEIS sync sends the fetched base to the authenticated backend route', () => {
  assert.match(source, /NEIS_TIMETABLE_SYNC_API_URL = 'https:\/\/school-reminder-backend\.vercel\.app\/api\/timetable-neis-sync'/)
  assert.match(source, /const user = await ensureSignedIn\(\)/)
  assert.match(source, /await user\.getIdToken\(\)/)
  assert.match(source, /weeklySchedule: result\.weeklySchedule/)
  assert.match(source, /lastClientSyncAt: Number\(cached\?\.syncedAt \|\| 0\)/)
})

test('NEIS client no longer writes the shared timetable document directly', () => {
  assert.doesNotMatch(source, /firebase\/firestore/)
  assert.doesNotMatch(source, /setDoc\(/)
  assert.doesNotMatch(source, /runTransaction\(/)
})
