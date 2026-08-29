import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRosterOrphans } from '../lib/class-roster-repair.js'

const NOW = 10_000_000

function baseInput(overrides = {}) {
  return {
    unresolvedKeys: ['student-orphan'],
    members: [{ studentKey: 'student-orphan', joinedAt: NOW - 60 * 60 * 1000 }],
    users: [],
    presence: [],
    activities: [],
    academicEvents: [],
    pushSubscriptions: [],
    todoStateKeys: [],
    nowMs: NOW,
    ...overrides,
  }
}

test('archives only an old unresolved member with no remaining identity or data references', () => {
  const result = classifyRosterOrphans(baseInput())
  assert.deepEqual(result.archive.map((entry) => entry.studentKey), ['student-orphan'])
  assert.deepEqual(result.keep, [])
})

test('never archives an unresolved member that still has a user identity', () => {
  const result = classifyRosterOrphans(baseInput({
    users: [{ studentKey: 'student-orphan', name: '학생' }],
  }))
  assert.deepEqual(result.archive, [])
  assert.deepEqual(result.keep[0].reasons, ['user_identity'])
})

test('never archives a member referenced by activity, academic history, push, or personal state', () => {
  const result = classifyRosterOrphans(baseInput({
    activities: [{ actorStudentKey: 'student-orphan' }],
    academicEvents: [{ creatorStudentKey: 'student-orphan' }],
    pushSubscriptions: [{ studentKey: 'student-orphan' }],
    todoStateKeys: ['student-orphan'],
  }))
  assert.deepEqual(result.archive, [])
  assert.deepEqual(result.keep[0].reasons, [
    'class_history',
    'push_subscription',
    'personal_todo_state',
  ])
})

test('never archives a recently active or newly joined unresolved member', () => {
  const recentPresence = classifyRosterOrphans(baseInput({
    presence: [{ studentKey: 'student-orphan', lastSeenMs: NOW - 30_000 }],
  }))
  assert.deepEqual(recentPresence.archive, [])
  assert.match(recentPresence.keep[0].reasons.join(','), /recent_presence/)

  const recentJoin = classifyRosterOrphans(baseInput({
    members: [{ studentKey: 'student-orphan', joinedAt: NOW - 60_000 }],
  }))
  assert.deepEqual(recentJoin.archive, [])
  assert.match(recentJoin.keep[0].reasons.join(','), /recent_or_unknown_join/)
})
