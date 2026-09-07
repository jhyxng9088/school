import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8')
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
  const source = read('../src/school-sync.js')
  assert.match(source, /onSnapshot\(classTodosCollection\(profile\)/)
  assert.match(source, /onSnapshot\(classReminderCategoriesCollection\(profile\)/)
  assert.match(source, /onSnapshot\(personalTodoStateCollection\(profile\)/)
  assert.equal(count(source, 'removeRevalidation = installServerRevalidation(refreshFromServer)'), 0)
  assert.match(source, /publishClassLiveData\('todos', classKeyFor\(profile\), nextTodos\)/)
  assert.match(source, /publishClassLiveData\('todoState', studentKeyFor\(profile\), nextState\)/)
})

test('school sync data-split behavior is source-owned and the final patch is retired', () => {
  const source = read('../src/school-sync.js')

  assert.match(source, /import \{ publishClassLiveData \} from '\.\/class-live-data\.js'/)
  assert.match(source, /publishClassLiveData\('todos', classKeyFor\(profile\), nextTodos\)/)
  assert.match(source, /publishClassLiveData\('todoState', studentKeyFor\(profile\), nextState\)/)
  assert.equal(count(source, "publishClassLiveData('timetable', classKeyFor(profile), next)"), 2)
  assert.equal(count(source, 'removeRevalidation = installServerRevalidation(refreshFromServer)'), 0)
  assert.doesNotMatch(source, /await refreshSharedTimetable\(\)/)
  assert.equal(fs.existsSync(new URL('../src/data-split-v1-patch.js', import.meta.url)), false)
})

test('shared timetable stays realtime and applies local edits before server confirmation', () => {
  const source = read('../src/school-sync.js')
  assert.match(source, /onSnapshot\(\s*timetableRef\(profile\)/)
  assert.doesNotMatch(source, /removeRevalidation = \(\) => \{\}\n\s*refreshFromServer\(\)/)
  assert.match(source, /saveWeeklySchedule\(normalized\)\n\s*setWeeklySchedule\(normalized\)\n\s*publishClassLiveData/)
  assert.match(source, /saveOverrides\(normalized\)\n\s*setOverrides\(normalized\)\n\s*publishClassLiveData/)
  assert.doesNotMatch(source, /await refreshSharedTimetable\(\)/)
})

test('activity and academic data stay realtime without duplicate server revalidation', () => {
  const source = read('../src/class-activity.js')
  assert.match(source, /onSnapshot\(\s*activityCollection\(normalized\)/)
  assert.match(source, /onSnapshot\(\s*academicCollection\(normalized\)/)
  assert.equal(count(source, 'removeRevalidation = installServerRevalidation(refreshFromServer)'), 0)
  assert.match(source, /publishClassLiveData\('activity', classKeyFor\(normalized\), next\)/)
  assert.match(source, /publishClassLiveData\('academic', classKeyFor\(normalized\), next\)/)
})

test('class activity live-data sync is source-owned and its build-patch leg stays retired', () => {
  const source = read('../src/class-activity.js')

  assert.match(source, /import \{ publishClassLiveData \} from '\.\/class-live-data\.js'/)
  assert.match(source, /publishClassLiveData\('activity', classKeyFor\(normalized\), next\)/)
  assert.match(source, /publishClassLiveData\('academic', classKeyFor\(normalized\), next\)/)
  assert.equal(count(source, 'removeRevalidation = installServerRevalidation(refreshFromServer)'), 0)
})

test('unread indicators reuse the app realtime stream instead of opening five duplicate Firestore listeners', () => {
  const source = read('../src/unread-indicators-v2.js')
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

test('unread live-data subscriptions are source-owned and their build-patch leg stays retired', () => {
  const source = read('../src/unread-indicators-v2.js')

  assert.match(source, /import \{ subscribeClassLiveData \} from '\.\/class-live-data\.js'/)
  assert.doesNotMatch(source, /\bonSnapshot\(/)
})

test('expired academic documents are no longer full-scanned by every client', () => {
  const source = read('../src/academic-expiry-cleanup.js')
  const functionStart = source.indexOf('export async function cleanupExpiredCustomAcademicEvents')
  const nextFunction = source.indexOf('function scheduleNextMidnight()', functionStart)
  const cleanupBody = source.slice(functionStart, nextFunction)
  assert.match(cleanupBody, /return true/)
  assert.doesNotMatch(cleanupBody, /getDocsFromServer/)
  assert.doesNotMatch(cleanupBody, /deleteDoc/)
})

test('timetable revalidation cleanup is source-owned and its main build-patch leg stays retired', () => {
  const source = read('../src/main.jsx')

  assert.equal(source.includes(LEGACY_TIMETABLE_REVALIDATION_EFFECT), false)
  assert.match(source, /  const aiContext = useMemo\(\(\) => \{/)
})

test('the in-memory bus is scoped so one class or student cannot replay another scope', () => {
  const source = read('../src/class-live-data.js')
  assert.match(source, /channelKey\(channel, scope\)/)
  assert.match(source, /latestByKey = new Map\(\)/)
  assert.match(source, /listenersByKey = new Map\(\)/)
  assert.match(source, /subscribeClassLiveData/)
})
