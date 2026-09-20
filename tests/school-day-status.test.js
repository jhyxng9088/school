import test from 'node:test'
import assert from 'node:assert/strict'
import {
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
