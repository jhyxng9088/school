import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('timetable motion observer stays inside the React app root', () => {
  const source = read('public/school-timetable-motion.js')

  assert.match(source, /const appRoot = document\.getElementById\('root'\)/)
  assert.match(source, /if \(appRoot\) \{[\s\S]*observer\.observe\(appRoot,/)
  assert.doesNotMatch(source, /document\.getElementById\('root'\) \|\| document\.documentElement/)
  assert.doesNotMatch(source, /observer\.observe\(document\.documentElement,/)
})

test('observer scoping preserves timetable motion and platform safeguards', () => {
  const source = read('public/school-timetable-motion.js')

  assert.match(source, /SamsungBrowser/)
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /const PAGE_READY_DELAY = 1120/)
  assert.match(source, /duration: 720/)
  assert.match(source, /translate3d\(0, 1\.5px, 0\)/)
  assert.match(source, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(source, /requestAnimationFrame/)
  assert.match(source, /attributeFilter: \['class'\]/)
})
