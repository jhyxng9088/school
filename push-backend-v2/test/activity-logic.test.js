
import test from 'node:test'
import assert from 'node:assert/strict'
import { reminderActivityRecipientEligible } from '../lib/activity-logic.js'

test('completed-only students still receive reminder edit activity', () => {
  assert.equal(reminderActivityRecipientEligible({
    actorStudentKey: 'student-a',
    recipientStudentKey: 'student-b',
    state: { completed: true, hidden: false },
  }), true)
})

test('hidden students never receive reminder edit activity', () => {
  assert.equal(reminderActivityRecipientEligible({
    actorStudentKey: 'student-a',
    recipientStudentKey: 'student-b',
    state: { completed: true, hidden: true },
  }), false)
})

test('the actor never receives their own reminder activity push', () => {
  assert.equal(reminderActivityRecipientEligible({
    actorStudentKey: 'student-a',
    recipientStudentKey: 'student-a',
    state: { completed: false, hidden: false },
  }), false)
})
