import test from 'node:test'
import assert from 'node:assert/strict'
import { reminderActivityBody, reminderActivityRecipientEligible } from '../lib/activity-logic.js'

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

test('reminder activity push uses honorific actor name', () => {
  assert.equal(
    reminderActivityBody({ actorName: '홍길동', action: 'added', title: '수학 과제' }),
    '홍길동님이 수학 과제 리마인더를 추가했어요.',
  )
  assert.equal(
    reminderActivityBody({ actorName: '홍길동', action: 'edited', title: '수학 과제' }),
    '홍길동님이 수학 과제 리마인더를 수정했어요.',
  )
})

test('reminder activity push strips leading list markers only', () => {
  assert.equal(
    reminderActivityBody({ actorName: '홍길동', action: 'added', title: '-수학 과제' }),
    '홍길동님이 수학 과제 리마인더를 추가했어요.',
  )
  assert.equal(
    reminderActivityBody({ actorName: '홍길동', action: 'edited', title: 'AI-반도체 발표' }),
    '홍길동님이 AI-반도체 발표 리마인더를 수정했어요.',
  )
})
