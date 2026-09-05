import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('remaining home runtime observer stays scoped to the React app root', () => {
  const source = read('public/school-home-live.js')
  assert.match(source, /const appRoot = document\.getElementById\('root'\)/)
  assert.match(source, /observer\.observe\(appRoot,/)
  assert.doesNotMatch(source, /document\.getElementById\('root'\) \|\| document\.documentElement/)
  assert.doesNotMatch(source, /observer\.observe\(document\.documentElement,/)
})

test('home live uses boundary scheduling instead of perpetual polling while preserving lunch reorder motion', () => {
  const index = read('index.html')
  const sw = read('public/sw.js')
  const live = read('public/school-home-live.js')

  assert.doesNotMatch(index, /school-home-nav\.js/)
  assert.doesNotMatch(sw, /school-home-nav\.js/)

  assert.doesNotMatch(live, /setInterval\(syncPriority, 15000\)/)
  assert.match(live, /lunchStart\.setHours\(12, 50, 0, 0\)/)
  assert.match(live, /lunchEnd\.setHours\(14, 0, 0, 0\)/)
  assert.match(live, /schedulePriorityBoundary/)
  assert.match(live, /setTimeout\(\(\) =>/)
  assert.match(live, /window\.addEventListener\('focus', syncAfterResume\)/)
  assert.match(live, /document\.addEventListener\('visibilitychange', syncAfterResume\)/)

  assert.match(live, /duration: 920/)
  assert.match(live, /delay: Math\.min\(index \* 42, 168\)/)
  assert.match(live, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(live, /animation\.id = 'home-lunch-reorder'/)
})
