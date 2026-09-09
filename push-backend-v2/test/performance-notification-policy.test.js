import test from 'node:test'
import assert from 'node:assert/strict'
import { planClassNotifications } from '../lib/planner.js'

const classId = '2-3'
const studentKey = 'student-23'
const subscriptions = [{
  id: 'sub-1',
  classId,
  studentKey,
  endpoint: 'https://push.example/sub-1',
  p256dh: 'p256dh',
  auth: 'auth',
}]
const statesByStudent = new Map([[studentKey, new Map()]])

function plansAt(iso, todos) {
  return planClassNotifications({
    classId,
    subscriptions,
    todos,
    statesByStudent,
    academicEvents: [],
    nowMs: Date.parse(iso),
  })
}

test('a Sep 16 performance assessment is notified on Sep 15 at 23:00 KST', () => {
  const todo = { id: 'performance-0916', type: 'performance', title: '물리학 수행평가', dueDate: '2026-09-16', dueTime: '' }
  const plans = plansAt('2026-09-15T23:00:00+09:00', [todo])

  assert.equal(plans.length, 1)
  assert.equal(plans[0].type, 'reminder-tomorrow')
  assert.equal(plans[0].studentKey, studentKey)
  assert.match(plans[0].payload.body, /내일 물리학 수행평가/)
})

test('performance assessments never receive the generic one-hour-before notification', () => {
  const todo = { id: 'performance-0916', type: 'performance', title: '물리학 수행평가', dueDate: '2026-09-16', dueTime: '23:00' }
  const plans = plansAt('2026-09-16T22:00:00+09:00', [todo])

  assert.deepEqual(plans, [])
})

test('Sep 16 at 23:00 does not re-notify an expiring Sep 16 performance assessment', () => {
  const today = { id: 'performance-0916', type: 'performance', title: '물리학 수행평가', dueDate: '2026-09-16', dueTime: '' }
  const tomorrow = { id: 'performance-0917', type: 'performance', title: '화학 수행평가', dueDate: '2026-09-17', dueTime: '' }

  assert.deepEqual(plansAt('2026-09-16T23:00:00+09:00', [today]), [])

  const plans = plansAt('2026-09-16T23:00:00+09:00', [today, tomorrow])
  assert.equal(plans.length, 1)
  assert.equal(plans[0].type, 'reminder-tomorrow')
  assert.match(plans[0].payload.body, /내일 화학 수행평가/)
  assert.doesNotMatch(plans[0].payload.body, /물리학 수행평가/)
})
