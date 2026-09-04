import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('class roster observer stays scoped to the React app root', () => {
  const source = read('src/class-roster-ui-v2.js')

  assert.match(source, /const appRoot = document\.getElementById\('root'\)/)
  assert.match(source, /if \(appRoot\) observer\.observe\(appRoot, \{ childList: true, subtree: true, characterData: true \}\)/)
  assert.doesNotMatch(source, /document\.getElementById\('root'\) \|\| document\.documentElement/)
  assert.doesNotMatch(source, /observer\.observe\(document\.documentElement/)
})

test('roster observer scoping preserves live presence, cache, modal motion lifecycle, and direct React ownership', () => {
  const source = read('src/class-roster-ui-v2.js')

  assert.match(source, /ROSTER_FRESH_MS = 2 \* 60_000/)
  assert.match(source, /ROSTER_STALE_CACHE_MS = 24 \* 60 \* 60_000/)
  assert.match(source, /const MODAL_CLOSE_MS = 320/)
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(source, /window\.addEventListener\('school:class-presence'/)
  assert.match(source, /window\.addEventListener\('school:student-profile-saved'/)
  assert.match(source, /queueMicrotask\(syncCounter\)/)
  assert.doesNotMatch(source, /window\.setInterval\(/)
})
