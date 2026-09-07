import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchDataSplitV1Source } from '../src/data-split-v1-patch.js'

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8')
}

function patched(path) {
  const source = read(path)
  return patchDataSplitV1Source(source, new URL(path, import.meta.url).pathname)
}

function count(source, marker) {
  return source.split(marker).length - 1
}

const LEGACY_TIMETABLE_REVALIDATION_EFFECT = `  useEffect(() => {
    if (!timetableActivityRevision || navigator.onLine === false) return
    refreshSharedTimetable()
  }, [timetableActivityRevision, refreshSharedTimetable])

`

test('class-shared reminders keep realtime listeners but stop focus-triggered full re-reads', () => {
  const source = patched('../src/school-sync.js')
  assert.match(source, /onSnapshot\(classTodosCollection\(profile\)/)
  assert.match(source, /onSnapshot\(classReminderCategoriesCollection\(profile\)/)
  assert.match(source, /onSnapshot\(personalTodoStateCollection\(profile\)/)
  assert.equal(count(source, 'removeRevalidation = installServerRevalidation(refreshFromServer)'), 0)
  assert.match(source, /publishClassLiveData\('todos', classKeyFor\(profile\), nextTodos\)/)
  assert.match(source, /publishClassLiveData\('todoState', studentKeyFor\(profile\), nextState\)/)
})

test('school sync data-split patch is idempotent before source ownership migration', () => {
  const path = new URL('../src/school-sync.js', import.meta.url).pathname
  const source = read('../src/school-sync.js')
  const once = patchDataSplitV1Source(source, path)
  const twice = patchDataSplitV1Source(once, path)
  assert.equal(twice, once)
})

test('shared timetable stays realtime and applies local edits before server confirmation', () => {
  const source = patched('../src/school-sync.js')
  assert.match(source, /onSnapshot\(\s*timetableRef\(profile\)/)
  assert.doesNotMatch(source, /removeRevalidation = \(\) => \{\}\n\s*refreshFromServer\(\)/)
  assert.match(source, /saveWeeklySchedule\(normalized\)\n\s*setWeeklySchedule\(normalized\)\n\s*publishClassLiveData/)
  assert.match(source, /saveOverrides\(normalized\)\n\s*setOverrides\(normalized\)\n\s*publishClassLiveData/)
  assert.doesNotMatch(source, /await refreshSharedTimetable\(\)/)
})

test('activity and academic data stay realtime without duplicate server revalidation', () => {
  const source = patched('../src/class-activity.js')
  assert.match(source, /onSnapshot\(\s*activityCollection\(normalized\)/)
  assert.match(source, /onSnapshot\(\s*academicCollection\(normalized\)/)
  assert.equal(count(source, 'removeRevalidation = installServerRevalidation(refreshFromServer)'), 0)
  assert.match(source, /publishClassLiveData\('activity', classKeyFor\(normalized\), next\)/)
  assert.match(source, /publishClassLiveData\('academic', classKeyFor\(normalized\), next\)/)
})

test('unread indicators reuse the app realtime stream instead of opening five duplicate Firestore listeners', () => {
  const source = patched('../src/unread-indicators-v2.js')
  assert.match(source, /subscribeClassLiveData\('activity', classId/)
  assert.match(source, /subscribeClassLiveData\('timetable', classId/)
  assert.match(source, /subscribeClassLiveData\('todos', classId/)
  assert.match(source, /subscribeClassLiveData\('academic', classId/)
  assert.match(source, /subscribeClassLiveData\('todoState', studentKey/)
  assert.doesNotMatch(source, /onSnapshot\(collection\(db, 'classes', classId, 'activity'/)
  assert.doesNotMatch(source, /onSnapshot\(collection\(db, 'classes', classId, 'todos'/)
  assert.doesNotMatch(source, /onSnapshot\(collection\(db, 'classes', classId, 'academicEvents'/)
  assert.doesNotMatch(source, /onSnapshot\(collection\(db, 'students', studentKey, 'todoState'/)
})

test('expired academic documents are no longer full-scanned by every client', () => {
  const source = patched('../src/academic-expiry-cleanup.js')
  const functionStart = source.indexOf('export async function cleanupExpiredCustomAcademicEvents')
  const nextFunction = source.indexOf('function scheduleNextMidnight()', functionStart)
  const cleanupBody = source.slice(functionStart, nextFunction)
  assert.match(cleanupBody, /return true/)
  assert.doesNotMatch(cleanupBody, /getDocsFromServer/)
  assert.doesNotMatch(cleanupBody, /deleteDoc/)
})

test('timetable revalidation cleanup is source-owned and its main build-patch leg stays retired', () => {
  const path = new URL('../src/main.jsx', import.meta.url).pathname
  const source = read('../src/main.jsx')
  const patchSource = read('../src/data-split-v1-patch.js')

  assert.equal(source.includes(LEGACY_TIMETABLE_REVALIDATION_EFFECT), false)
  assert.equal(patchDataSplitV1Source(source, path), source)
  assert.match(source, /  const aiContext = useMemo\(\(\) => \{/)

  assert.doesNotMatch(patchSource, /function patchMain\(/)
  assert.doesNotMatch(patchSource, /endsWith\('\/src\/main\.jsx'\)/)
  assert.doesNotMatch(patchSource, /timetableActivityRevision/)
  assert.match(patchSource, /endsWith\('\/src\/school-sync\.js'\)/)
  assert.match(patchSource, /endsWith\('\/src\/class-activity\.js'\)/)
  assert.match(patchSource, /endsWith\('\/src\/unread-indicators-v2\.js'\)/)
})

test('the in-memory bus is scoped so one class or student cannot replay another scope', () => {
  const source = read('../src/class-live-data.js')
  assert.match(source, /channelKey\(channel, scope\)/)
  assert.match(source, /latestByKey = new Map\(\)/)
  assert.match(source, /listenersByKey = new Map\(\)/)
  assert.match(source, /subscribeClassLiveData/)
})
