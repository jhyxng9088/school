import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home runtime observers stay scoped to the React app root', () => {
  for (const path of ['public/school-home-nav.js', 'public/school-home-live.js']) {
    const source = read(path)
    assert.match(source, /const appRoot = document\.getElementById\('root'\) \|\| document\.documentElement/)
    assert.match(source, /observer\.observe\(appRoot,/)
    assert.doesNotMatch(source, /observer\.observe\(document\.documentElement,/)
  }
})

test('observer scoping does not remove home navigation or lunch reorder behavior', () => {
  const nav = read('public/school-home-nav.js')
  const live = read('public/school-home-live.js')

  assert.match(nav, /SHubNavigation\?\.navigate\(route\)/)
  assert.match(nav, /addEventListener\('click'/)
  assert.match(nav, /addEventListener\('keydown'/)

  assert.match(live, /setInterval\(syncPriority, 15000\)/)
  assert.match(live, /duration: 920/)
  assert.match(live, /animation\.id = 'home-lunch-reorder'/)
})
