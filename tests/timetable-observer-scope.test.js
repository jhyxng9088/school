import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('timetable motion is driven by the React timetable owner instead of a DOM observer', () => {
  const main = read('src/main.jsx')
  const motion = read('public/school-timetable-motion.js')

  assert.match(main, /document\.dispatchEvent\(new Event\('school:timetable-motion-sync'\)\)/)
  assert.match(motion, /document\.addEventListener\('school:timetable-motion-sync', syncTimetableMotion\)/)
  assert.match(motion, /const cellSignatures = new WeakMap\(\)/)
  assert.match(motion, /previous !== signature/)
  assert.doesNotMatch(motion, /MutationObserver/)
  assert.doesNotMatch(motion, /observer\.observe/)
  assert.doesNotMatch(motion, /attributeFilter/)
})

test('semantic timetable motion preserves the existing motion and platform safeguards', () => {
  const source = read('public/school-timetable-motion.js')

  assert.match(source, /SamsungBrowser/)
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /const PAGE_READY_DELAY = 1120/)
  assert.match(source, /duration: 720/)
  assert.match(source, /translate3d\(0, 1\.5px, 0\)/)
  assert.match(source, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(source, /requestAnimationFrame/)
  assert.match(source, /document\.querySelectorAll\(TIMETABLE_PAGE_SELECTOR\)\.forEach\(schedulePageReady\)/)
  assert.match(source, /document\.querySelectorAll\(CELL_SELECTOR\)\.forEach/)
})
