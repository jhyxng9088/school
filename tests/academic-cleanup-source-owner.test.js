import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('academic cleanup behavior remains source-owned after the data-split patch is retired', () => {
  const source = read('src/academic-expiry-cleanup.js')
  const start = source.indexOf('export async function cleanupExpiredCustomAcademicEvents')
  const end = source.indexOf('\nfunction scheduleNextMidnight()', start)
  assert.ok(start >= 0 && end > start)

  const owner = source.slice(start, end)
  assert.match(owner, /return true/)
  assert.doesNotMatch(owner, /getDocsFromServer|deleteDoc|collection\(/)
  assert.equal(fs.existsSync(new URL('../src/data-split-v1-patch.js', import.meta.url)), false)
})
