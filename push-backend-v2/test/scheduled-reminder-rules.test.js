import test from 'node:test'
import assert from 'node:assert/strict'
import { planClassNotifications } from '../lib/planner.js'
import { todoRelevantForCheckpoints } from '../lib/scheduled-candidates.js'

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

test('performance notification is D-1 23:00 regardless of extracted or fabricated dueTime', () => {
  for (const dueTime of ['', '00:00', '09:10', '15:00', '23:59', '99:99']) {
    const todo = { id: 'performance-1', type: 'performance', title: '수행평가', dueDate: '2026-09-09', dueTime }
    const input = { classId: 'class-1', subscriptions, todos: [todo] }
    for (const [time, count] of [['2026-09-08T22:59:59', 0], ['2026-09-08T23:00:00', 1], ['2026-09-08T23:09:59', 1], ['2026-09-08T23:10:00', 0], ['2026-09-09T00:00:00', 0], ['2026-09-09T14:00:00', 0]]) {
      const nowMs = epochKst(time)
      assert.equal(todoRelevantForCheckpoints(todo, [nowMs], nowMs), count === 1)
      const plans = planClassNotifications({ ...input, nowMs })
      assert.equal(plans.length, count, `${dueTime} / ${time}`)
      if (count) assert.equal(plans[0].type, 'reminder-tomorrow')
    }
  }
})

test('performance backfill cannot deliver a stale tomorrow alert on the due day', () => {
  const todo = { type: 'performance', dueDate: '2026-09-09', dueTime: '' }
  const checkpoints = [epochKst('2026-09-08T23:05:00')]
  assert.equal(todoRelevantForCheckpoints(todo, checkpoints, epochKst('2026-09-08T23:30:00')), true)
  assert.equal(todoRelevantForCheckpoints(todo, checkpoints, epochKst('2026-09-09T00:00:00')), false)
  assert.equal(todoRelevantForCheckpoints(todo, checkpoints, epochKst('2026-09-09T17:00:00')), false)
  assert.equal(todoRelevantForCheckpoints({ ...todo, type: 'task' }, checkpoints, epochKst('2026-09-09T17:00:00')), true)
})
