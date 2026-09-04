import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/neis-timetable-sync.js', import.meta.url), 'utf8')

test('NEIS lifecycle sync keeps only the earliest pending timer', () => {
  assert.match(source, /let syncTimer = 0/)
  assert.match(source, /let syncDueAt = 0/)
  assert.match(source, /const dueAt = Date\.now\(\) \+ delay/)
  assert.match(source, /if \(syncTimer && syncDueAt <= dueAt\) return/)
  assert.match(source, /if \(syncTimer\) window\.clearTimeout\(syncTimer\)/)
  assert.match(source, /syncTimer = window\.setTimeout\(\(\) => \{[\s\S]*syncTimer = 0[\s\S]*syncDueAt = 0[\s\S]*void safeSync\(\)[\s\S]*\}, delay\)/)
  assert.doesNotMatch(source, /window\.setTimeout\(\(\) => safeSync\(\), delay\)/)
})

test('NEIS lifecycle trigger priorities remain unchanged', () => {
  assert.match(source, /scheduleSync\(900\)/)
  assert.match(source, /school:student-profile-saved'[\s\S]*scheduleSync\(250\)/)
  assert.match(source, /'online'[\s\S]*scheduleSync\(350\)/)
  assert.match(source, /'focus'[\s\S]*scheduleSync\(500\)/)
})
