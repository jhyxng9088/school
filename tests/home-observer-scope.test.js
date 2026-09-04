import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home runtime observers stay scoped to the React app root', () => {
  for (const path of ['public/school-home-nav.js', 'public/school-home-live.js']) {
    const source = read(path)
    assert.match(source, /const appRoot = document\.getElementById\('root'\)/)
    assert.match(source, /observer\.observe\(appRoot,/)
    assert.doesNotMatch(source, /document\.getElementById\('root'\) \|\| document\.documentElement/)
    assert.doesNotMatch(source, /observer\.observe\(document\.documentElement,/)
  }
})

test('home live uses boundary scheduling instead of perpetual polling while preserving navigation and lunch reorder motion', () => {
  const nav = read('public/school-home-nav.js')
  const live = read('public/school-home-live.js')

  assert.match(nav, /SHubNavigation\?\.navigate\(route\)/)
  assert.match(nav, /addEventListener\('click'/)
  assert.match(nav, /addEventListener\('keydown'/)

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
