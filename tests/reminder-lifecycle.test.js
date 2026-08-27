
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isReminderExpired,
  reminderActivityEligibleForStudent,
  reminderExpiryMs,
} from '../src/reminder-lifecycle.js'

test('timed reminder expires at its exact KST due time', () => {
  const todo = { dueDate: '2026-08-27', dueTime: '17:00' }
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T16:59:59+09:00')), false)
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T17:00:00+09:00')), true)
})

test('untimed reminder expires at the end of its KST day', () => {
  const todo = { dueDate: '2026-08-27', dueTime: '' }
  assert.equal(reminderExpiryMs(todo), Date.parse('2026-08-27T23:59:59+09:00'))
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T23:59:58+09:00')), false)
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T23:59:59+09:00')), true)
})

test('completed-only reminder remains eligible for friend edit dots', () => {
  const todo = { dueDate: '2026-08-28', dueTime: '17:00' }
  assert.equal(reminderActivityEligibleForStudent(
    todo,
    { completed: true, hidden: false },
    Date.parse('2026-08-27T18:00:00+09:00'),
  ), true)
})

test('hidden reminder is never eligible for friend edit dots', () => {
  const todo = { dueDate: '2026-08-28', dueTime: '17:00' }
  assert.equal(reminderActivityEligibleForStudent(
    todo,
    { completed: true, hidden: true },
    Date.parse('2026-08-27T18:00:00+09:00'),
  ), false)
})
