import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchDataSplitV1Source } from '../src/data-split-v1-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('academic cleanup behavior is source-owned and no longer changed by the data-split patch', () => {
  const source = read('src/academic-expiry-cleanup.js')
  const start = source.indexOf('export async function cleanupExpiredCustomAcademicEvents')
  const end = source.indexOf('\nfunction scheduleNextMidnight()', start)
  assert.ok(start >= 0 && end > start)

  const owner = source.slice(start, end)
  assert.match(owner, /return true/)
  assert.doesNotMatch(owner, /getDocsFromServer|deleteDoc|collection\(/)
  assert.equal(
    patchDataSplitV1Source(source, '/workspace/src/academic-expiry-cleanup.js'),
    source,
  )
})
