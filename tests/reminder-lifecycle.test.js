
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeImportItem } from '../src/s-hub-ai-core.js'
import { spawnSync } from 'node:child_process'
import * as reminderLifecycle from '../src/reminder-lifecycle.js'
import {
  isReminderExpired,
  reminderActivityEligibleForStudent,
  reminderExpiryMs,
} from '../src/reminder-lifecycle.js'

test('reminder lifecycle exposes only the canonical public contract', () => {
  assert.deepEqual(Object.keys(reminderLifecycle).sort(), [
    'isReminderExpired',
    'reminderActivityEligibleForStudent',
    'reminderExpiryMs',
  ])
})

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

const schoolTimetable = {
  weeklySchedule: { tue: { 6: '영어' }, wed: { 7: '자율' } },
  overrides: {},
}
const performance = { type: 'performance', dueDate: '2026-09-09', dueTime: '' }

test('performance remains all morning and expires at the last shared lesson, including unread', () => {
  for (const time of ['00:00:00', '09:10:00', '16:49:59']) {
    const now = Date.parse(`2026-09-09T${time}+09:00`)
    assert.equal(isReminderExpired(performance, now, schoolTimetable), false)
    assert.equal(reminderActivityEligibleForStudent(performance, {}, now, schoolTimetable), true)
  }
  const end = Date.parse('2026-09-09T16:50:00+09:00')
  assert.equal(reminderExpiryMs(performance, schoolTimetable), end)
  assert.equal(isReminderExpired(performance, end, schoolTimetable), true)
  assert.equal(reminderActivityEligibleForStudent(performance, {}, end, schoolTimetable), false)
})

test('six-lesson days and an added seventh shared lesson use the canonical period ends', () => {
  const todo = { ...performance, dueDate: '2026-09-08' }
  assert.equal(reminderExpiryMs(todo, schoolTimetable), Date.parse('2026-09-08T15:50:00+09:00'))
  const extended = { ...schoolTimetable, overrides: { '2026-09-08': { 7: '보충' } } }
  assert.equal(reminderExpiryMs(todo, extended), Date.parse('2026-09-08T16:50:00+09:00'))
})

test('weekends, missing timetable and explicitly empty school days use controlled 16:50 fallback', () => {
  for (const dueDate of ['2026-09-09', '2026-09-12', '2026-09-13']) {
    for (const timetable of [null, { weeklySchedule: {}, overrides: {} }]) {
      assert.equal(reminderExpiryMs({ ...performance, dueDate }, timetable), Date.parse(`${dueDate}T16:50:00+09:00`))
    }
  }
})

test('AI-generated notification/expiry values cannot override performance policy; explicit time remains a fact', () => {
  for (const dueTime of ['00:01', '09:10', '23:59', '99:99', '']) {
    const item = normalizeImportItem({
      ...performance, dueTime, kind: 'reminder', title: '영어 수행평가', confidence: 'high',
      notifyAt: '2026-09-09T01:00:00+09:00', expiresAt: 1, schoolEnd: '02:00',
    }, 0, new Date('2026-09-08T00:00:00Z'))
    assert.ok(item.valid)
    assert.equal('notifyAt' in item, false)
    assert.equal('expiresAt' in item, false)
    assert.equal('schoolEnd' in item, false)
    assert.equal(reminderExpiryMs(item, schoolTimetable), Date.parse('2026-09-09T16:50:00+09:00'))
    if (dueTime === '09:10') assert.equal(item.dueTime, '09:10')
  }
})

test('performance expiry is identical across device timezones and KST midnight', () => {
  const expected = Date.parse('2026-09-09T16:50:00+09:00')
  for (const TZ of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
    const code = `import {reminderExpiryMs,isReminderExpired} from './src/reminder-lifecycle.js';
      const todo=${JSON.stringify(performance)}; const timetable=${JSON.stringify(schoolTimetable)};
      console.log(JSON.stringify([reminderExpiryMs(todo,timetable),isReminderExpired(todo,Date.parse('2026-09-08T15:00:00Z'),timetable)]));`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, TZ } })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), [expected, false])
  }
})
