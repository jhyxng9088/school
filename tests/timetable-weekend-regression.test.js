import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  dateKey,
  getNextSchoolDate,
  getTimetableWeekAnchor,
  getWeekDates,
} from '../src/timetable.js'

test('weekend timetable opens the next school week', () => {
  const saturday = new Date(2026, 7, 29, 12, 0, 0)
  const sunday = new Date(2026, 7, 30, 12, 0, 0)
  assert.equal(dateKey(getTimetableWeekAnchor(saturday)), '2026-08-31')
  assert.equal(dateKey(getTimetableWeekAnchor(sunday)), '2026-08-31')
  assert.deepEqual(
    getWeekDates(getTimetableWeekAnchor(saturday)).map(dateKey),
    ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
  )
})

test('temporary change defaults to the next real school day after classes finish', () => {
  const fridayAfterClass = new Date(2026, 7, 28, 17, 30, 0)
  assert.equal(dateKey(getNextSchoolDate(fridayAfterClass, true)), '2026-08-31')

  const wednesday = new Date(2026, 7, 26, 12, 0, 0)
  assert.equal(dateKey(getNextSchoolDate(wednesday, false)), '2026-08-26')
  assert.equal(dateKey(getNextSchoolDate(wednesday, true)), '2026-08-27')
})

test('timetable page follows the date that was temporarily changed and uses polite modal copy', () => {
  const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /setWeekAnchor\(selectedDate\)/)
  assert.match(main, /getNextSchoolDate\(now, currentState\.kind === 'done'\)/)
  assert.ok(main.includes('기본 시간표는 그대로 두고 선택한 날짜에만 적용됩니다. 지나면 자동으로 기본 시간표로 돌아옵니다.'))
  assert.ok(!main.includes('기본 시간표로 돌아와.'))
})

test('personal timetable cache is student-scoped and paints before its save request finishes', () => {
  const sync = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')
  assert.match(sync, /personalTimetableCacheKey\(profile, kind\)/)
  assert.match(sync, /studentKeyFor\(profile\)/)
  assert.match(sync, /loadPersonalWeeklyScheduleCache\(profile\)/)
  assert.match(sync, /loadPersonalOverridesCache\(profile, now\)/)

  const weeklyBlock = sync.slice(
    sync.indexOf('const commitPersonalWeeklySchedule'),
    sync.indexOf('const commitPersonalOverrides'),
  )
  assert.ok(weeklyBlock.indexOf('setPersonalWeeklySchedule(normalized)') < weeklyBlock.indexOf("requestPersonalTimetable(profile, { action: 'saveWeekly'"))

  const overrideBlock = sync.slice(sync.indexOf('const commitPersonalOverrides'))
  assert.ok(overrideBlock.indexOf('setPersonalOverrides(normalized)') < overrideBlock.indexOf("requestPersonalTimetable(profile, { action: 'saveOverrides'"))
})
