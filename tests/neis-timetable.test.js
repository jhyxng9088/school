import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchGrade2ClassTimetable, neisTargetWeek } from '../src/neis-timetable.js'

test('Sunday targets the upcoming school week', () => {
  const week = neisTargetWeek(new Date(2026, 7, 30, 12, 0, 0, 0))
  assert.equal(week.weekStart, '20260831')
  assert.equal(week.weekEnd, '20260904')
})

test('grade 2 class timetable uses the verified NEIS mirror in one request', async () => {
  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    assert.equal(url.hostname, 'kschoolinfo.com')

    const classNumber = Number(url.searchParams.get('class'))
    const rows = []
    const dates = ['20260831', '20260901', '20260902', '20260903', '20260904']
    const periodCounts = [6, 6, 7, 6, 7]
    dates.forEach((date, dayIndex) => {
      for (let period = 1; period <= periodCounts[dayIndex]; period += 1) {
        rows.push({
          date,
          grade: '2',
          class: String(classNumber),
          period,
          subject: `C${classNumber}-${date}-P${period}`,
          classroom: String(classNumber),
        })
      }
    })

    return {
      ok: true,
      async json() {
        return { ok: true, data: rows, meta: { source: 'NEIS', count: rows.length } }
      },
    }
  }

  try {
    const result = await fetchGrade2ClassTimetable(3, new Date(2026, 7, 30, 12, 0, 0, 0))
    assert.equal(result.available, true)
    assert.equal(result.dataSource, 'NEIS-mirror')
    assert.equal(result.classNumber, 3)
    assert.equal(result.weekStart, '20260831')
    assert.equal(result.weekEnd, '20260904')
    assert.equal(result.rows.length, 32)
    assert.equal(result.subjectCount, 32)
    assert.equal(result.weeklySchedule.mon[1], 'C3-20260831-P1')
    assert.equal(result.weeklySchedule.wed[7], 'C3-20260902-P7')
    assert.equal(result.weeklySchedule.fri[7], 'C3-20260904-P7')
    assert.equal(calls.length, 1)

    const url = calls[0]
    assert.equal(url.searchParams.get('eduCode'), 'J10')
    assert.equal(url.searchParams.get('schoolCode'), '7530093')
    assert.equal(url.searchParams.get('grade'), '2')
    assert.equal(url.searchParams.get('class'), '3')
    assert.equal(url.searchParams.get('kind'), 'his')
    assert.equal(url.searchParams.get('from'), '20260831')
    assert.equal(url.searchParams.get('to'), '20260904')
  } finally {
    global.fetch = originalFetch
  }
})

test('no NEIS rows never produces a replacement timetable', async () => {
  const originalFetch = global.fetch
  global.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'kschoolinfo.com') {
      return {
        ok: true,
        async json() {
          return { ok: true, data: [], meta: { source: 'NEIS', count: 0 } }
        },
      }
    }
    return {
      ok: true,
      async json() {
        return { RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }
      },
    }
  }

  try {
    const result = await fetchGrade2ClassTimetable(16, new Date(2026, 7, 30, 12, 0, 0, 0))
    assert.equal(result.available, false)
    assert.equal(result.rows.length, 0)
    assert.equal(result.subjectCount, 0)
  } finally {
    global.fetch = originalFetch
  }
})
