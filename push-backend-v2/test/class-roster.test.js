import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildClassRoster,
  classNumberFromId,
  inferStudentNumber,
  studentKeyForRosterIdentity,
} from '../lib/class-roster.js'

test('class roster identity round-trips class, number, and normalized name', () => {
  const key = studentKeyForRosterIdentity({ classNumber: 1, studentNumber: 24, name: ' 홍 길동 ' })
  assert.match(key, /^student-[0-9a-f]{16}$/)
  assert.equal(classNumberFromId('class-1'), 1)
  assert.equal(inferStudentNumber({ classId: 'class-1', studentKey: key, name: '홍 길동' }), 24)
  assert.equal(inferStudentNumber({ classId: 'class-2', studentKey: key, name: '홍 길동' }), 0)
})

test('class roster deduplicates the same student across anonymous-auth devices', () => {
  const studentKey = studentKeyForRosterIdentity({ classNumber: 1, studentNumber: 7, name: '김학생' })
  const roster = buildClassRoster({
    classId: 'class-1',
    nowMs: 100_000,
    users: [
      { classId: 'class-1', studentKey, name: '김학생', createdAt: 10, updatedAt: 10 },
      { classId: 'class-1', studentKey, name: '김학생', createdAt: 20, updatedAt: 20 },
    ],
    presence: [{ studentKey, lastSeenMs: 99_000 }],
  })

  assert.equal(roster.total, 1)
  assert.equal(roster.online, 1)
  assert.deepEqual(roster.members, [{
    studentNumber: 7,
    name: '김학생',
    online: true,
    conflict: false,
    aliases: ['김학생'],
  }])
})

test('class roster exposes conflicting registrations for the same class number instead of double-counting', () => {
  const firstKey = studentKeyForRosterIdentity({ classNumber: 1, studentNumber: 3, name: '첫이름' })
  const secondKey = studentKeyForRosterIdentity({ classNumber: 1, studentNumber: 3, name: '다른이름' })
  const roster = buildClassRoster({
    classId: 'class-1',
    nowMs: 100_000,
    users: [
      { classId: 'class-1', studentKey: firstKey, name: '첫이름', createdAt: 10, updatedAt: 10 },
      { classId: 'class-1', studentKey: secondKey, name: '다른이름', createdAt: 20, updatedAt: 20 },
    ],
    presence: [{ studentKey: secondKey, lastSeenMs: 99_000 }],
  })

  assert.equal(roster.total, 1)
  assert.equal(roster.online, 1)
  assert.equal(roster.members[0].studentNumber, 3)
  assert.equal(roster.members[0].name, '첫이름')
  assert.equal(roster.members[0].conflict, true)
  assert.deepEqual(roster.members[0].aliases, ['첫이름', '다른이름'])
})

test('class roster ignores malformed identities and reports unresolved records', () => {
  const roster = buildClassRoster({
    classId: 'class-1',
    users: [
      { classId: 'class-1', studentKey: 'student-not-valid', name: '학생' },
      { classId: 'class-2', studentKey: 'student-other-class', name: '다른반' },
    ],
  })

  assert.equal(roster.total, 0)
  assert.equal(roster.unresolved, 1)
  assert.deepEqual(roster.members, [])
})
