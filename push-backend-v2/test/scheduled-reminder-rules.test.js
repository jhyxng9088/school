import test from 'node:test'
import assert from 'node:assert/strict'
import { planClassNotifications } from '../lib/planner.js'

function epochKst(value) {
  return Date.parse(`${value}+09:00`)
}

const subscriptions = [{
  id: 'device-1',
  studentKey: 'student-1',
  endpoint: 'https://push.example/1',
  p256dh: 'key',
  auth: 'auth',
}]

test('untimed tomorrow reminder is planned at 23:00', () => {
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions,
    todos: [{ id: 'todo-1', title: '준비물', dueDate: '2026-09-01', dueTime: '' }],
    nowMs: epochKst('2026-08-31T23:05:00'),
  })
  assert.equal(plans.filter((plan) => plan.type === 'reminder-tomorrow').length, 1)
})

test('timed tomorrow reminder is not included in the 23:00 preview', () => {
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions,
    todos: [{ id: 'todo-1', title: '수행평가', dueDate: '2026-09-01', dueTime: '15:00' }],
    nowMs: epochKst('2026-08-31T23:05:00'),
  })
  assert.equal(plans.filter((plan) => plan.type === 'reminder-tomorrow').length, 0)
})

test('timed reminder is planned exactly in the one-hour-before window', () => {
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions,
    todos: [{ id: 'todo-1', title: '수행평가', dueDate: '2026-09-01', dueTime: '15:00' }],
    nowMs: epochKst('2026-09-01T14:05:00'),
  })
  assert.equal(plans.filter((plan) => plan.type === 'reminder-hour').length, 1)
  assert.equal(plans.filter((plan) => plan.type === 'reminder-tomorrow').length, 0)
})

test('completed or hidden reminder does not produce an alert', () => {
  const completedStates = new Map([['student-1', new Map([['todo-1', { completed: true }]])]])
  const hiddenStates = new Map([['student-1', new Map([['todo-1', { hidden: true }]])]])
  const input = {
    classId: 'class-1',
    subscriptions,
    todos: [{ id: 'todo-1', title: '준비물', dueDate: '2026-09-01', dueTime: '' }],
    nowMs: epochKst('2026-08-31T23:05:00'),
  }
  assert.equal(planClassNotifications({ ...input, statesByStudent: completedStates }).length, 0)
  assert.equal(planClassNotifications({ ...input, statesByStudent: hiddenStates }).length, 0)
})