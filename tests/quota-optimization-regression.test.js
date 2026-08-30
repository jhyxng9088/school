import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sync = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')
const academic = fs.readFileSync(new URL('../src/academic-expiry-cleanup.js', import.meta.url), 'utf8')
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('realtime reminder listeners remain enabled', () => {
  assert.match(sync, /onSnapshot\(classTodosCollection\(profile\)/)
  assert.match(sync, /onSnapshot\(personalTodoStateCollection\(profile\)/)
})

test('realtime shared timetable listener remains enabled', () => {
  assert.match(sync, /onSnapshot\(\s*timetableRef\(profile\)/)
})

test('presence heartbeat remains enabled for live class status', () => {
  assert.match(sync, /classPresenceRef\(profile\)/)
  assert.match(sync, /lastSeenMs:\s*Date\.now\(\)/)
  assert.match(sync, /where\('lastSeenMs',\s*'>=',\s*threshold\)/)
})

test('academic cleanup is throttled without removing expiry cleanup', () => {
  assert.match(academic, /CLEANUP_MIN_INTERVAL_MS/)
  assert.match(academic, /deleteDoc\(item\.ref\)/)
  assert.match(academic, /scheduleNextMidnight/)
})

test('device profile sync is loaded without replacing core app modules', () => {
  assert.match(index, /device-profile-sync\.js/)
  assert.match(index, /src\/main\.jsx/)
  assert.match(index, /neis-timetable-sync\.js/)
})
