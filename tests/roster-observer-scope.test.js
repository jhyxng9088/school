import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('class roster runtime no longer observes or rewrites the React app root', () => {
  const source = read('src/class-roster-ui-v2.js')
  const main = read('src/main.jsx')

  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /observer\.observe/)
  assert.doesNotMatch(source, /document\.getElementById\('root'\)/)
  assert.doesNotMatch(source, /querySelector\('\.class-presence-count'\)/)
  assert.doesNotMatch(source, /function syncCounter\(/)
  assert.doesNotMatch(source, /function applyRosterCounter\(/)
  assert.match(main, /class-presence-count is-roster-button/)
  assert.match(main, /onClick=\{\(event\) => openClassRoster\(\{ keyboard: event\.detail === 0 \}\)\}/)
})

test('roster modal keeps live presence, cache, motion lifecycle, and idle warmup without DOM observation', () => {
  const source = read('src/class-roster-ui-v2.js')

  assert.match(source, /ROSTER_FRESH_MS = 2 \* 60_000/)
  assert.match(source, /ROSTER_STALE_CACHE_MS = 24 \* 60 \* 60_000/)
  assert.match(source, /const MODAL_CLOSE_MS = 320/)
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(source, /window\.addEventListener\('school:class-presence'/)
  assert.match(source, /window\.addEventListener\('school:student-profile-saved'/)
  assert.match(source, /document\.addEventListener\('DOMContentLoaded', scheduleModalWarmup, \{ once: true \}\)/)
  assert.doesNotMatch(source, /queueMicrotask\(syncCounter\)/)
  assert.doesNotMatch(source, /window\.setInterval\(/)
})
