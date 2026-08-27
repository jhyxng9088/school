import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IMPORTANT_PREFIX,
  activeForStudent,
  academicTomorrowBody,
  isImportantAcademic,
  isNightPreviewWindow,
  isReminderHourDue,
  reminderHourBody,
  reminderTomorrowBody,
  tomorrowDateKey,
} from '../lib/schedule-logic.js'
import { planClassNotifications } from '../lib/planner.js'

function epochKst(value) {
  return Date.parse(`${value}+09:00`)
}

test('1시간 전 리마인더는 10분 허용창 안에서만 due', () => {
  const todo = { dueDate: '2026-08-28', dueTime: '15:00' }
  assert.equal(isReminderHourDue(todo, epochKst('2026-08-28T14:00:00')), true)
  assert.equal(isReminderHourDue(todo, epochKst('2026-08-28T14:07:00')), true)
  assert.equal(isReminderHourDue(todo, epochKst('2026-08-28T14:10:00')), false)
  assert.equal(isReminderHourDue(todo, epochKst('2026-08-28T13:59:59')), false)
})

test('시간 없는 리마인더는 1시간 전 알림 대상이 아니다', () => {
  assert.equal(isReminderHourDue({ dueDate: '2026-08-28', dueTime: '' }, epochKst('2026-08-28T14:00:00')), false)
})

test('완료 또는 숨김/삭제된 개인 리마인더는 제외한다', () => {
  const todo = { id: 'a' }
  assert.equal(activeForStudent(todo, null), true)
  assert.equal(activeForStudent(todo, { completed: false, hidden: false }), true)
  assert.equal(activeForStudent(todo, { completed: true, hidden: false }), false)
  assert.equal(activeForStudent(todo, { completed: false, hidden: true }), false)
  assert.equal(activeForStudent(todo, { completed: true, hidden: true }), false)
})

test('23시 00~09분만 다음날 미리 알림 창이다', () => {
  assert.equal(isNightPreviewWindow(epochKst('2026-08-27T22:59:59')), false)
  assert.equal(isNightPreviewWindow(epochKst('2026-08-27T23:00:00')), true)
  assert.equal(isNightPreviewWindow(epochKst('2026-08-27T23:09:59')), true)
  assert.equal(isNightPreviewWindow(epochKst('2026-08-27T23:10:00')), false)
})

test('다음날 날짜 계산은 월말도 정확하다', () => {
  assert.equal(tomorrowDateKey(epochKst('2026-08-31T23:05:00')), '2026-09-01')
})

test('중요일정 토글은 detail prefix가 있는 일정만 true', () => {
  assert.equal(isImportantAcademic({ detail: `${IMPORTANT_PREFIX}체육대회` }), true)
  assert.equal(isImportantAcademic({ detail: '체육대회' }), false)
  assert.equal(isImportantAcademic({ detail: '' }), false)
})

test('알림 문구 형식', () => {
  assert.equal(reminderHourBody('수학 과제'), '수학 과제 했어?')
  assert.equal(reminderTomorrowBody([{ title: '수학 과제' }]), '내일 수학 과제 있어. 확인했어?')
  assert.equal(reminderTomorrowBody([{ title: '수학 과제' }, { title: '영어 단어' }]), '내일 수학 과제 외 1개 할 일이 있어. 확인했어?')
  assert.equal(academicTomorrowBody([{ title: '체육대회' }]), '내일 체육대회가 있어.')
  assert.equal(academicTomorrowBody([{ title: '체육대회' }, { title: '동아리 발표' }]), '내일 체육대회 외 1개 중요 일정이 있어.')
})

const subs = [
  { id: 'a1', studentKey: 'student-a' },
  { id: 'a2', studentKey: 'student-a' },
  { id: 'b1', studentKey: 'student-b' },
]

test('1시간 전 알림은 완료/숨김 학생을 빼고 미완료 학생 기기에만 보낸다', () => {
  const states = new Map([
    ['student-a', new Map([['todo-1', { completed: true, hidden: false }]])],
    ['student-b', new Map([['todo-1', { completed: false, hidden: false }]])],
  ])
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions: subs,
    todos: [{ id: 'todo-1', title: '수학 과제', dueDate: '2026-08-28', dueTime: '15:00' }],
    statesByStudent: states,
    nowMs: epochKst('2026-08-28T14:03:00'),
  })
  assert.equal(plans.length, 1)
  assert.equal(plans[0].studentKey, 'student-b')
  assert.deepEqual(plans[0].recipients.map((item) => item.id), ['b1'])
  assert.equal(plans[0].payload.body, '수학 과제 했어?')
})

test('숨김/삭제 처리된 리마인더는 전날 23시 알림에서도 제외한다', () => {
  const states = new Map([
    ['student-a', new Map([['todo-1', { completed: true, hidden: true }]])],
    ['student-b', new Map([['todo-1', { completed: false, hidden: true }]])],
  ])
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions: subs,
    todos: [{ id: 'todo-1', title: '수학 과제', dueDate: '2026-08-28', dueTime: '' }],
    statesByStudent: states,
    nowMs: epochKst('2026-08-27T23:04:00'),
  })
  assert.equal(plans.filter((plan) => plan.type.startsWith('reminder')).length, 0)
})

test('공유 리마인더 문서가 삭제되어 입력 목록에 없으면 알림 계획도 없다', () => {
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions: subs,
    todos: [],
    statesByStudent: new Map(),
    nowMs: epochKst('2026-08-27T23:04:00'),
  })
  assert.equal(plans.length, 0)
})

test('23시 알림은 학생별 미완료 리마인더만 묶는다', () => {
  const states = new Map([
    ['student-a', new Map([
      ['todo-1', { completed: false, hidden: false }],
      ['todo-2', { completed: true, hidden: false }],
    ])],
    ['student-b', new Map([
      ['todo-1', { completed: false, hidden: false }],
      ['todo-2', { completed: false, hidden: false }],
    ])],
  ])
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions: subs,
    todos: [
      { id: 'todo-1', title: '수학 과제', dueDate: '2026-08-28', dueTime: '' },
      { id: 'todo-2', title: '영어 단어', dueDate: '2026-08-28', dueTime: '' },
    ],
    statesByStudent: states,
    nowMs: epochKst('2026-08-27T23:04:00'),
  })
  const reminders = plans.filter((plan) => plan.type === 'reminder-tomorrow')
  assert.equal(reminders.length, 2)
  assert.equal(reminders.find((p) => p.studentKey === 'student-a').payload.body, '내일 수학 과제 있어. 확인했어?')
  assert.equal(reminders.find((p) => p.studentKey === 'student-b').payload.body, '내일 수학 과제 외 1개 할 일이 있어. 확인했어?')
})

test('학사일정은 중요 토글 prefix가 있는 일정만 전날 23시에 보낸다', () => {
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions: subs,
    todos: [],
    statesByStudent: new Map(),
    academicEvents: [
      { id: 'academic-1', title: '체육대회', startDate: '2026-08-28', detail: `${IMPORTANT_PREFIX}중요` },
      { id: 'academic-2', title: '일반 일정', startDate: '2026-08-28', detail: '일반' },
    ],
    nowMs: epochKst('2026-08-27T23:04:00'),
  })
  const academic = plans.filter((plan) => plan.type === 'academic-tomorrow')
  assert.equal(academic.length, 1)
  assert.equal(academic[0].payload.body, '내일 체육대회가 있어.')
  assert.equal(academic[0].recipients.length, 3)
})

test('23시에 자정 마감 1시간 전 알림과 전날 요약이 겹치면 같은 todo를 두 번 넣지 않는다', () => {
  const plans = planClassNotifications({
    classId: 'class-1',
    subscriptions: [{ id: 'a1', studentKey: 'student-a' }],
    todos: [{ id: 'todo-1', title: '자정 과제', dueDate: '2026-08-28', dueTime: '00:00' }],
    statesByStudent: new Map(),
    nowMs: epochKst('2026-08-27T23:03:00'),
  })
  assert.equal(plans.filter((plan) => plan.type === 'reminder-hour').length, 1)
  assert.equal(plans.filter((plan) => plan.type === 'reminder-tomorrow').length, 0)
})
