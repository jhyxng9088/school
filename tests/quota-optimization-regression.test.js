import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sync = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')
const academic = fs.readFileSync(new URL('../src/academic-expiry-cleanup.js', import.meta.url), 'utf8')
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const bootstrap = fs.readFileSync(new URL('../src/app-bootstrap.jsx', import.meta.url), 'utf8')
const pushClient = fs.readFileSync(new URL('../src/push-client.js', import.meta.url), 'utf8')
const pushDirect = fs.readFileSync(new URL('../src/push-dispatch-direct.js', import.meta.url), 'utf8')
const classActivity = fs.readFileSync(new URL('../src/class-activity.js', import.meta.url), 'utf8')

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

test('academic cleanup keeps its lifecycle cadence without client scan or delete work', () => {
  const start = academic.indexOf('export async function cleanupExpiredCustomAcademicEvents')
  const end = academic.indexOf('\nfunction scheduleNextMidnight()', start)
  assert.ok(start >= 0 && end > start)
  const cleanupBody = academic.slice(start, end)

  assert.match(academic, /CLEANUP_MIN_INTERVAL_MS/)
  assert.match(academic, /scheduleNextMidnight/)
  assert.match(cleanupBody, /return true/)
  assert.doesNotMatch(cleanupBody, /collection\(|getDocsFromServer|deleteDoc/)
})

test('device profile sync is loaded without replacing core app modules', () => {
  assert.match(index, /device-profile-sync\.js/)
  assert.match(index, /src\/app-bootstrap\.jsx/)
  assert.doesNotMatch(index, /type="module" src="\/src\/main\.jsx"/)
  assert.match(bootstrap, /import\('\.\/main\.jsx'\)/)
  assert.match(index, /neis-timetable-sync\.js/)
})


test('push fallback reuses canonical live data instead of duplicate Firestore listeners', () => {
  assert.match(pushClient, /subscribeClassLiveData\('activity', classId/)
  assert.match(pushClient, /subscribeClassLiveData\('academic', classId/)
  assert.doesNotMatch(pushClient, /\bonSnapshot\b/)
  assert.doesNotMatch(pushClient, /collection\(db, 'classes', classId, 'activity'\)/)
  assert.doesNotMatch(pushClient, /collection\(db, 'classes', classId, 'academicEvents'\)/)
})

test('immediate class push remains owned by committed local activity events', () => {
  assert.match(classActivity, /const PUSH_ACTIVITY_EVENT = 'school:activity-committed'/)
  assert.match(classActivity, /await batch\.commit\(\)[\s\S]*emitCommittedActivity/)
  assert.match(classActivity, /await setDoc\(ref, storedCandidate\)[\s\S]*emitCommittedActivity/)
  assert.match(pushDirect, /window\.addEventListener\(PUSH_ACTIVITY_EVENT/)
  assert.match(pushDirect, /dispatchCommittedActivity\(event\)/)
})

test('push identity relies on canonical signed-in identity verification without a second users read', () => {
  const start = pushClient.indexOf('async function resolveIdentity')
  const end = pushClient.indexOf('\nasync function serviceWorkerRegistration', start)
  assert.ok(start >= 0 && end > start)
  const body = pushClient.slice(start, end)
  assert.match(body, /await ensureSignedIn\(\)/)
  assert.doesNotMatch(body, /getDoc\(|users/)
})
