import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const stage3 = fs.readFileSync(new URL('../src/stage3-core.js', import.meta.url), 'utf8')
const sync = fs.readFileSync(new URL('../src/neis-timetable-sync.js', import.meta.url), 'utf8')
const styles = fs.readFileSync(new URL('../src/timetable.css', import.meta.url), 'utf8')

test('closure state survives timetable repair through one school-scoped owner', () => {
  assert.match(stage3, /readSchoolClosureSnapshot\(profile\)/)
  assert.match(stage3, /subscribeSchoolClosureSnapshot\(profile, setSchoolClosures\)/)
  assert.match(stage3, /replaceSchoolClosureSnapshot\(profile, closuresFromAcademicEvents\(events\)\)/)
  assert.match(stage3, /schoolClosures,/)
  assert.match(sync, /mergeSchoolClosureSnapshot\(profile, closureEntriesFromTimetableResult\(result\)\)/)
})

test('timetable renders an explicit disabled closure state from cached closure data', () => {
  assert.match(main, /schoolData\?\.schoolClosures/)
  assert.match(main, /className="school-closed-badge">휴업/)
  assert.match(main, /week-cell is-school-closed/)
  assert.match(styles, /\.week-day-head\.is-school-closed/)
  assert.match(styles, /\.school-closed-badge/)
  assert.match(styles, /\.week-cell\.is-school-closed/)
})
