import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/admin-overview-v3.js', import.meta.url), 'utf8')

test('admin overview v3 avoids collection-group indexes for live activity and presence', () => {
  assert.equal(source.includes("collectionGroup('presence')"), false)
  assert.equal(source.includes("collectionGroup('activity')"), false)
  assert.equal(source.includes("collection('presence').where('lastSeenMs'"), true)
  assert.equal(source.includes("collection('activity').where('updatedAt'"), true)
})
