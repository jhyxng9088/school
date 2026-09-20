import test from 'node:test'
import assert from 'node:assert/strict'
import { IMPORTANT_PREFIX } from '../lib/schedule-logic.js'
import { normalizeOfficialAcademicRows } from '../lib/neis-academic.js'
import { academicEventAllowedForClass, planClassNotifications } from '../lib/planner.js'

function epochKst(value) {
  return Date.parse(`${value}+09:00`)
}

test('server-fetched Suji official academic events are explicitly legacy-school scoped', () => {
  const events = normalizeOfficialAcademicRows([
    {
      AA_YMD: '20260910',
      EVENT_NM: '2학기 중간고사',
      EVENT_CNTNT: '고2',
      TW_GRADE_EVENT_YN: 'Y',
    },
  ], ['20260910'])

  assert.equal(events.length, 1)
  assert.equal(events[0].legacySchoolOnly, true)
})

test('legacy official academic events are allowed only for legacy class-N ids', () => {
  const official = { legacySchoolOnly: true }
  assert.equal(academicEventAllowedForClass(official, 'class-1'), true)
  assert.equal(academicEventAllowedForClass(official, 'class-30'), true)
  assert.equal(academicEventAllowedForClass(official, 's-12ab34cd56ef-c1'), false)
  assert.equal(academicEventAllowedForClass(official, 'preview-class-1'), false)
  assert.equal(academicEventAllowedForClass({}, 's-12ab34cd56ef-c1'), true)
})

test('a new-school class never receives the legacy Suji official academic push', () => {
  const subscriptions = [{ id: 'device-1', studentKey: 'student-a' }]
  const nowMs = epochKst('2026-09-09T23:04:00')
  const legacyOfficial = {
    id: 'official-1',
    title: '2학기 중간고사',
    startDate: '2026-09-10',
    detail: `${IMPORTANT_PREFIX}수지고 2학년`,
    legacySchoolOnly: true,
  }
  const classCustom = {
    id: 'custom-1',
    title: '우리 학교 수행 일정',
    startDate: '2026-09-10',
    detail: `${IMPORTANT_PREFIX}우리 학교`,
  }

  const plans = planClassNotifications({
    classId: 's-12ab34cd56ef-c1',
    subscriptions,
    academicEvents: [legacyOfficial, classCustom],
    nowMs,
  }).filter((plan) => plan.type === 'academic-tomorrow')

  assert.equal(plans.length, 1)
  assert.equal(plans[0].payload.body, '내일 우리 학교 수행 일정 예정이에요.')
})
