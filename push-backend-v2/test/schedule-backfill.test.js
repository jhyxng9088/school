import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHEDULE_BACKFILL_LOOKBACK_MS,
  SCHEDULE_BACKFILL_OVERLAP_MS,
  SCHEDULE_BACKFILL_STEP_MS,
  recentScheduleCheckpoints,
  recoverableScheduledPlans,
  scheduleLookbackMs,
  uniqueScheduledPlans,
} from '../lib/schedule-backfill.js'
import { planClassNotifications } from '../lib/planner.js'

function epochKst(value) {
  return Date.parse(`${value}+09:00`)
}

test('초기 실행은 최근 24시간을 5분 간격으로 재검사한다', () => {
  const nowMs = epochKst('2026-08-31T00:50:00')
  const checkpoints = recentScheduleCheckpoints(nowMs)
  assert.equal(SCHEDULE_BACKFILL_LOOKBACK_MS, 24 * 60 * 60 * 1000)
  assert.equal(SCHEDULE_BACKFILL_STEP_MS, 5 * 60 * 1000)
  assert.equal(SCHEDULE_BACKFILL_OVERLAP_MS, 10 * 60 * 1000)
  assert.equal(checkpoints.length, 289)
  assert.equal(checkpoints[0], nowMs)
  assert.equal(checkpoints.at(-1), epochKst('2026-08-30T00:50:00'))
})

test('정상적인 5분 주기에서는 전체 24시간 대신 짧은 겹침 구간만 검사한다', () => {
  const nowMs = epochKst('2026-08-31T12:00:00')
  const lastSuccessMs = epochKst('2026-08-31T11:55:00')
  const lookbackMs = scheduleLookbackMs(lastSuccessMs, nowMs)
  assert.equal(lookbackMs, 15 * 60 * 1000)
  assert.equal(recentScheduleCheckpoints(nowMs, lookbackMs).length, 4)
})

test('실행이 오래 끊겨도 catch-up은 최대 24시간으로 제한한다', () => {
  const nowMs = epochKst('2026-08-31T12:00:00')
  const lastSuccessMs = epochKst('2026-08-29T08:00:00')
  assert.equal(scheduleLookbackMs(lastSuccessMs, nowMs), SCHEDULE_BACKFILL_LOOKBACK_MS)
})

test('자정 이후에도 전날 23시 미발송 알림을 다시 계획할 수 있다', () => {
  const nowMs = epochKst('2026-08-31T00:50:00')
  const checkpoints = recentScheduleCheckpoints(nowMs)
  const plans = checkpoints.flatMap((plannerNowMs) => planClassNotifications({
    classId: 'class-1',
    subscriptions: [{ id: 'a1', studentKey: 'student-a' }],
    todos: [{ id: 'todo-1', title: '준비물', dueDate: '2026-08-31', dueTime: '' }],
    statesByStudent: new Map(),
    nowMs: plannerNowMs,
  }))
  const recoverable = recoverableScheduledPlans(plans, nowMs)
  assert.equal(recoverable.filter((plan) => plan.type === 'reminder-tomorrow').length, 1)
  assert.equal(recoverable[0].payload.body, '내일 준비물 있어요. 확인해 주세요.')
})

test('마감이 이미 지난 시간 지정 알림은 장시간 catch-up에서 버린다', () => {
  const nowMs = epochKst('2026-08-31T16:00:00')
  const recoverable = recoverableScheduledPlans([
    {
      key: 'expired-hour',
      type: 'reminder-hour',
      expiresAt: epochKst('2026-08-31T15:00:00'),
    },
    {
      key: 'still-useful',
      type: 'reminder-tomorrow',
      expiresAt: epochKst('2026-08-31T23:59:59'),
    },
  ], nowMs)
  assert.deepEqual(recoverable.map((plan) => plan.key), ['still-useful'])
})

test('같은 스케줄 키는 catch-up 구간에서 한 번만 유지한다', () => {
  const unique = uniqueScheduledPlans([
    { key: 'same', type: 'reminder-tomorrow' },
    { key: 'same', type: 'reminder-tomorrow' },
    { key: 'other', type: 'reminder-hour' },
  ])
  assert.deepEqual(unique.map((plan) => plan.key), ['same', 'other'])
})