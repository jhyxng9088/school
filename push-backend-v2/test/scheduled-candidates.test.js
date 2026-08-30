import test from 'node:test'
import assert from 'node:assert/strict'
import {
  academicRelevantForCheckpoints,
  candidateDateKeys,
  todoRelevantForCheckpoints,
} from '../lib/scheduled-candidates.js'
import { IMPORTANT_PREFIX } from '../lib/schedule-logic.js'

function epochKst(value) {
  return Date.parse(`${value}+09:00`)
}

test('daytime candidate query only targets the date that can fire one-hour reminders', () => {
  const checkpoints = [
    epochKst('2026-08-31T12:00:00'),
    epochKst('2026-08-31T11:55:00'),
    epochKst('2026-08-31T11:50:00'),
  ]
  const result = candidateDateKeys(checkpoints)
  assert.deepEqual(result.todoDates, ['2026-08-31'])
  assert.deepEqual(result.academicDates, [])
})

test('night candidate query includes tomorrow reminders and academic events', () => {
  const checkpoints = [epochKst('2026-08-31T23:05:00')]
  const result = candidateDateKeys(checkpoints)
  assert.deepEqual(result.todoDates, ['2026-09-01'])
  assert.deepEqual(result.academicDates, ['2026-09-01'])
})

test('timed reminders are candidates only for their one-hour notification window', () => {
  const noon = [epochKst('2026-08-31T12:00:00')]
  assert.equal(todoRelevantForCheckpoints({
    id: 'timed',
    dueDate: '2026-08-31',
    dueTime: '13:00',
  }, noon), true)
  assert.equal(todoRelevantForCheckpoints({
    id: 'not-yet',
    dueDate: '2026-08-31',
    dueTime: '14:00',
  }, noon), false)
})

test('only untimed tomorrow reminders become 23:00 candidates', () => {
  const night = [epochKst('2026-08-31T23:05:00')]
  assert.equal(todoRelevantForCheckpoints({
    id: 'untimed',
    dueDate: '2026-09-01',
    dueTime: '',
  }, night), true)
  assert.equal(todoRelevantForCheckpoints({
    id: 'timed',
    dueDate: '2026-09-01',
    dueTime: '15:00',
  }, night), false)
})

test('only important academic events for tomorrow become night candidates', () => {
  const night = [epochKst('2026-08-31T23:05:00')]
  assert.equal(academicRelevantForCheckpoints({
    startDate: '2026-09-01',
    detail: `${IMPORTANT_PREFIX}중요`,
  }, night), true)
  assert.equal(academicRelevantForCheckpoints({
    startDate: '2026-09-01',
    detail: '일반 일정',
  }, night), false)
})