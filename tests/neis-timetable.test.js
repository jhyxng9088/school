import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchGrade2ClassTimetable, neisTargetWeek } from '../src/neis-timetable.js'

test('Sunday targets the upcoming school week', () => {
  const week = neisTargetWeek(new Date(2026, 7, 30, 12, 0, 0, 0))
  assert.equal(week.weekStart, '20260831')
  assert.equal(week.weekEnd, '20260904')
})

test('grade 2 class timetable is assembled from NEIS sample-sized requests', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    const date = url.searchParams.get('ALL_TI_YMD')
    const classNumber = Number(url.searchParams.get('CLASS_NM'))
    const requestedPeriod = Number(url.searchParams.get('PERIO') || 0)
    const periods = requestedPeriod ? [requestedPeriod] : [1, 2, 3, 4, 5]
    const rows = periods.map((period) => ({
      ALL_TI_YMD: date,
      GRADE: '2',
      CLASS_NM: String(classNumber),
      PERIO: String(period),
      ITRT_CNTNT: `C${classNumber}-${date}-P${period}`,
    }))
    return {
      ok: true,
      async json() {
        return {
          hisTimetable: [
            { head: [{ list_total_count: rows.length }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다.' } }] },
            { row: rows },
          ],
        }
      },
    }
  }

  try {
    const result = await fetchGrade2ClassTimetable(3, new Date(2026, 7, 30, 12, 0, 0, 0))
    assert.equal(result.available, true)
    assert.equal(result.classNumber, 3)
    assert.equal(result.weekStart, '20260831')
    assert.equal(result.weekEnd, '20260904')
    assert.equal(result.rows.length, 35)
    assert.equal(result.subjectCount, 32)
    assert.equal(result.weeklySchedule.mon[1], 'C3-20260831-P1')
    assert.equal(result.weeklySchedule.wed[7], 'C3-20260902-P7')
    assert.equal(result.weeklySchedule.fri[7], 'C3-20260904-P7')
    assert.equal(calls.length, 15)
    calls.forEach((url) => {
      assert.equal(url.searchParams.get('KEY'), 'sample')
      assert.equal(url.searchParams.get('ATPT_OFCDC_SC_CODE'), 'J10')
      assert.equal(url.searchParams.get('SD_SCHUL_CODE'), '7530093')
      assert.equal(url.searchParams.get('GRADE'), '2')
      assert.equal(url.searchParams.get('CLASS_NM'), '3')
      assert.equal(url.searchParams.get('pSize'), '5')
    })
  } finally {
    global.fetch = originalFetch
  }
})

test('no NEIS rows never produces a replacement timetable', async () => {
  const originalFetch = global.fetch
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }
    },
  })

  try {
    const result = await fetchGrade2ClassTimetable(16, new Date(2026, 7, 30, 12, 0, 0, 0))
    assert.equal(result.available, false)
    assert.equal(result.rows.length, 0)
    assert.equal(result.subjectCount, 0)
  } finally {
    global.fetch = originalFetch
  }
})
