import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadOverrides,
  loadWeeklySchedule,
  saveOverrides,
  saveWeeklySchedule,
} from '../src/timetable.js'

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  get length() {
    return this.values.size
  }

  key(index) {
    return [...this.values.keys()][index] ?? null
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null
  }

  setItem(key, value) {
    this.values.set(String(key), String(value))
  }

  removeItem(key) {
    this.values.delete(String(key))
  }

  clear() {
    this.values.clear()
  }
}

function setProfile(profile) {
  global.localStorage.setItem('school.studentProfile.v1', JSON.stringify(profile))
}

function schoolProfile({ officeCode, schoolCode, grade, classNumber }) {
  return {
    name: 'Cache Test',
    studentNumber: 1,
    schoolName: '테스트고등학교',
    schoolKind: '고등학교',
    officeCode,
    schoolCode,
    grade,
    classNumber,
  }
}

test('timetable and override caches are isolated by school, grade, and class', () => {
  const previousStorage = global.localStorage
  global.localStorage = new MemoryStorage()

  try {
    const schoolA = schoolProfile({ officeCode: 'J10', schoolCode: '7530093', grade: 2, classNumber: 3 })
    const schoolB = schoolProfile({ officeCode: 'B10', schoolCode: '7010001', grade: 1, classNumber: 3 })

    setProfile(schoolA)
    saveWeeklySchedule({ mon: { 1: 'A학교수업' } })
    saveOverrides({ '2099-01-05': { 1: 'A학교변경' } })

    assert.ok(global.localStorage.getItem(
      'school.timetable.weekly.v2.school-J10-7530093.grade-2.class-3',
    ))
    assert.ok(global.localStorage.getItem(
      'school.timetable.overrides.v2.school-J10-7530093.grade-2.class-3',
    ))

    setProfile(schoolB)
    assert.equal(loadWeeklySchedule().mon[1], '')
    assert.deepEqual(loadOverrides(), {})

    saveWeeklySchedule({ mon: { 1: 'B학교수업' } })
    setProfile(schoolA)
    assert.equal(loadWeeklySchedule().mon[1], 'A학교수업')
    assert.equal(loadOverrides()['2099-01-05'][1], 'A학교변경')
  } finally {
    global.localStorage = previousStorage
  }
})

test('legacy class-only cache migrates once and is not reused after a school switch', () => {
  const previousStorage = global.localStorage
  global.localStorage = new MemoryStorage()

  try {
    const schoolA = schoolProfile({ officeCode: 'J10', schoolCode: '7530093', grade: 2, classNumber: 3 })
    const schoolB = schoolProfile({ officeCode: 'B10', schoolCode: '7010001', grade: 1, classNumber: 3 })

    global.localStorage.setItem(
      'school.timetable.weekly.v2.class-3',
      JSON.stringify({ mon: { 1: '기존캐시' } }),
    )

    setProfile(schoolA)
    assert.equal(loadWeeklySchedule().mon[1], '기존캐시')
    assert.ok(global.localStorage.getItem(
      'school.timetable.weekly.v2.school-J10-7530093.grade-2.class-3',
    ))

    setProfile(schoolB)
    assert.equal(loadWeeklySchedule().mon[1], '')
    assert.equal(
      global.localStorage.getItem('school.timetable.weekly.v2.school-B10-7010001.grade-1.class-3'),
      null,
    )
  } finally {
    global.localStorage = previousStorage
  }
})

test('school-aware class 1 does not inherit the old class 1 default timetable', () => {
  const previousStorage = global.localStorage
  global.localStorage = new MemoryStorage()

  try {
    setProfile(schoolProfile({ officeCode: 'B10', schoolCode: '7010001', grade: 1, classNumber: 1 }))
    assert.equal(loadWeeklySchedule().mon[1], '')

    setProfile({ name: 'Legacy', studentNumber: 1, classNumber: 1 })
    assert.equal(loadWeeklySchedule().mon[1], '역학')
  } finally {
    global.localStorage = previousStorage
  }
})
