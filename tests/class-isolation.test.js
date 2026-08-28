// Regression coverage for class isolation and custom academic expiry cleanup.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createEmptyWeeklySchedule,
  loadOverrides,
  loadWeeklySchedule,
  saveOverrides,
  saveWeeklySchedule,
  TIMETABLE_STORAGE_KEY,
  OVERRIDES_STORAGE_KEY,
} from '../src/timetable.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
    clear: () => values.clear(),
  }
}

function setProfile(classNumber) {
  localStorage.setItem('school.studentProfile.v1', JSON.stringify({
    name: `학생${classNumber}`,
    classNumber,
    studentNumber: 1,
  }))
}

test('authenticated class operations synchronize immutable class identity first', () => {
  const source = read('src/school-sync.js')
  assert.match(source, /async function ensureStoredProfileIdentity\(user\)/)
  assert.match(source, /const classId = classKeyFor\(profile\)/)
  assert.match(source, /const studentKey = studentKeyFor\(profile\)/)
  assert.match(source, /return ensureStoredProfileIdentity\(user\)/)
  assert.match(source, /String\(existing\.classId \|\| ''\) !== classId/)
})

test('class 2 never inherits the historical class-1 timetable cache', () => {
  globalThis.localStorage = memoryStorage()
  const legacy = createEmptyWeeklySchedule()
  legacy.mon[1] = '1반전용'
  localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(legacy))
  setProfile(2)

  const loaded = loadWeeklySchedule()
  assert.equal(loaded.mon[1], '')
  saveWeeklySchedule({ ...loaded, mon: { ...loaded.mon, 1: '2반전용' } })
  assert.equal(localStorage.getItem(`${TIMETABLE_STORAGE_KEY}.class-2`) !== null, true)
  assert.equal(JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY)).mon['1'], '1반전용')
})

test('class 1 migrates the old timetable cache without exposing it to other classes', () => {
  globalThis.localStorage = memoryStorage()
  const legacy = createEmptyWeeklySchedule()
  legacy.tue[2] = '기존1반'
  localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(legacy))
  setProfile(1)

  const loaded = loadWeeklySchedule()
  assert.equal(loaded.tue[2], '기존1반')
  assert.equal(localStorage.getItem(`${TIMETABLE_STORAGE_KEY}.class-1`) !== null, true)
})

test('timetable overrides are stored independently per class', () => {
  globalThis.localStorage = memoryStorage()
  setProfile(1)
  saveOverrides({ '2099-09-01': { 1: '1반변경' } })
  setProfile(2)
  saveOverrides({ '2099-09-01': { 1: '2반변경' } })

  assert.equal(JSON.parse(localStorage.getItem(`${OVERRIDES_STORAGE_KEY}.class-1`))['2099-09-01']['1'], '1반변경')
  assert.equal(JSON.parse(localStorage.getItem(`${OVERRIDES_STORAGE_KEY}.class-2`))['2099-09-01']['1'], '2반변경')
  assert.equal(loadOverrides()['2099-09-01']['1'], '2반변경')
})

test('academic expiry cleanup targets only class custom academicEvents', () => {
  const source = read('src/academic-expiry-cleanup.js')
  assert.match(source, /collection\(db, 'classes', classId, 'academicEvents'\)/)
  assert.match(source, /DATE_KEY_PATTERN\.test\(endDate\) && endDate < today/)
  assert.match(source, /millisecondsUntilNextKoreaMidnight/)
  assert.doesNotMatch(source, /schoolData|NEIS|neis/i)
})
