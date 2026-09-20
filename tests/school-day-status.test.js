import test from 'node:test'
import assert from 'node:assert/strict'
import {
  closuresFromAcademicEvents,
  inferSchoolClosureFromSchedule,
  isNonInstructionalSchoolLabel,
  isSchoolClosureDayOffType,
  nextOpenSchoolDate,
  schoolClosureForDate,
} from '../src/school-day-status.js'

test('NEIS 휴업일만 학교 휴업 상태로 취급한다', () => {
  assert.equal(isSchoolClosureDayOffType('휴업일'), true)
  assert.equal(isSchoolClosureDayOffType('재량휴업일'), true)
  assert.equal(isSchoolClosureDayOffType('해당없음'), false)
  assert.equal(isSchoolClosureDayOffType(''), false)
})

test('날짜별 휴업 오버레이는 기본 시간표와 별개로 학사일정에서 계산한다', () => {
  const events = [
    { rawDate: '20260924', name: '추석연휴', dayOffType: '휴업일' },
    { rawDate: '20260923', name: '체육대회', dayOffType: '해당없음' },
  ]
  assert.deepEqual(schoolClosureForDate(new Date(2026, 8, 24, 12), events), {
    rawDate: '20260924',
    label: '추석연휴',
    dayOffType: '휴업일',
  })
  assert.equal(schoolClosureForDate(new Date(2026, 8, 23, 12), events), null)
})

test('휴업일은 변경 시간표 기본 선택 날짜에서도 건너뛴다', () => {
  const events = [
    { rawDate: '20260924', name: '추석연휴', dayOffType: '휴업일' },
    { rawDate: '20260925', name: '추석연휴', dayOffType: '휴업일' },
  ]
  const next = nextOpenSchoolDate(new Date(2026, 8, 24, 9), events, { includeAnchor: true })
  assert.equal(next.getFullYear(), 2026)
  assert.equal(next.getMonth(), 8)
  assert.equal(next.getDate(), 28)
})

test('시간표 응답의 휴일 표기도 보조 안전장치로 감지한다', () => {
  assert.equal(isNonInstructionalSchoolLabel('추석'), true)
  assert.equal(isNonInstructionalSchoolLabel('대체공휴일'), true)
  assert.equal(isNonInstructionalSchoolLabel('미적분I'), false)
})


test('이미 저장된 추석 값이 여러 교시에 남아 있으면 휴업일로 추론한다', () => {
  const closure = inferSchoolClosureFromSchedule([
    { number: 1, subject: '추석' },
    { number: 2, subject: '추석' },
    { number: 3, subject: '화법과 언어 A' },
    { number: 4, subject: '추석' },
  ])
  assert.deepEqual(closure, {
    label: '추석',
    dayOffType: '시간표 휴업일',
    inferred: true,
  })
})

test('일반 과목 한 칸은 휴업일로 오판하지 않는다', () => {
  assert.equal(inferSchoolClosureFromSchedule([
    { number: 1, subject: '미적분I' },
    { number: 2, subject: '영어II' },
  ]), null)
})

test('학사일정 캐시가 비어 있어도 오염된 시간표를 보고 변경 날짜에서 휴일을 건너뛴다', () => {
  const next = nextOpenSchoolDate(new Date(2026, 8, 24, 9), [], {
    includeAnchor: true,
    scheduleForDate: (date) => (
      date.getDate() === 24 || date.getDate() === 25
        ? [{ subject: '추석' }, { subject: '추석' }]
        : [{ subject: '국어' }]
    ),
  })
  assert.equal(next.getFullYear(), 2026)
  assert.equal(next.getMonth(), 8)
  assert.equal(next.getDate(), 28)
})


test('복구된 정상 시간표에서도 저장된 휴업일 스냅샷이 날짜 상태를 유지한다', () => {
  const cachedClosures = [
    { rawDate: '20260924', label: '추석', dayOffType: '휴업일' },
  ]
  assert.deepEqual(
    schoolClosureForDate(
      new Date(2026, 8, 24, 12),
      [],
      [{ subject: '정보' }, { subject: '기하' }],
      cachedClosures,
    ),
    { rawDate: '20260924', label: '추석', dayOffType: '휴업일' },
  )
})

test('NEIS가 휴업 구분을 약하게 내려줘도 명확한 공휴일 이름은 캐시에 남긴다', () => {
  assert.deepEqual(closuresFromAcademicEvents([
    { rawDate: '20260924', name: '추석연휴', dayOffType: '해당없음' },
    { rawDate: '20260923', name: '체육대회', dayOffType: '해당없음' },
  ]), [
    { rawDate: '20260924', label: '추석연휴', dayOffType: '해당없음' },
  ])
})

test('저장된 휴업일 스냅샷도 변경 추가 날짜에서 건너뛴다', () => {
  const next = nextOpenSchoolDate(new Date(2026, 8, 24, 9), [], {
    includeAnchor: true,
    cachedClosures: [
      { rawDate: '20260924', label: '추석', dayOffType: '휴업일' },
      { rawDate: '20260925', label: '추석', dayOffType: '휴업일' },
    ],
    scheduleForDate: () => [{ subject: '국어' }],
  })
  assert.equal(next.getDate(), 28)
})
