import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isImportantAcademicTitle,
  normalizeOfficialAcademicRows,
  officialImportantAcademicEventsForDates,
} from '../lib/neis-academic.js'

test('official academic filtering matches the app important-exam rules', () => {
  assert.equal(isImportantAcademicTitle('9월 전국연합학력평가'), true)
  assert.equal(isImportantAcademicTitle('2학기 기말고사'), true)
  assert.equal(isImportantAcademicTitle('학생회 행사'), false)
})

test('NEIS rows keep only important schedules relevant to second grade', () => {
  const events = normalizeOfficialAcademicRows([
    { AA_YMD: '20260902', EVENT_NM: '9월 전국연합학력평가', EVENT_CNTNT: '고2', ONE_GRADE_EVENT_YN: 'N', TW_GRADE_EVENT_YN: 'Y', THREE_GRADE_EVENT_YN: 'N' },
    { AA_YMD: '20260902', EVENT_NM: '3학년 모의고사', THREE_GRADE_EVENT_YN: 'Y', TW_GRADE_EVENT_YN: 'N' },
    { AA_YMD: '20260902', EVENT_NM: '학생회 행사', TW_GRADE_EVENT_YN: 'Y' },
    { AA_YMD: '20260902', EVENT_NM: '토요휴업일', TW_GRADE_EVENT_YN: 'Y' },
  ], ['20260902'])

  assert.equal(events.length, 1)
  assert.equal(events[0].title, '9월 전국연합학력평가')
  assert.equal(events[0].startDate, '2026-09-02')
  assert.match(events[0].detail, /^\u2063school-important\u2063/)
})

test('known mock-exam fallback survives a NEIS outage without breaking the scheduler', async () => {
  const result = await officialImportantAcademicEventsForDates(['2026-09-02'], async () => {
    throw new Error('offline')
  })

  assert.deepEqual(result.failedDates, ['2026-09-02'])
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].title, '9월 전국연합학력평가')
})

test('NEIS and fallback copies of the same exam are deduplicated', async () => {
  const result = await officialImportantAcademicEventsForDates(['2026-09-02'], async () => ({
    ok: true,
    async json() {
      return {
        SchoolSchedule: [{ row: [{
          AA_YMD: '20260902',
          EVENT_NM: '9월 전국연합학력평가',
          EVENT_CNTNT: '고2',
          TW_GRADE_EVENT_YN: 'Y',
        }] }],
      }
    },
  }))

  assert.equal(result.failedDates.length, 0)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].title, '9월 전국연합학력평가')
})
