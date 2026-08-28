import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/todo.jsx', import.meta.url), 'utf8')

test('automatic reminder expiry deletes the original server document without tombstoning its due date', () => {
  const autoStart = source.indexOf('const expired = sourceTodos.filter')
  const autoEnd = source.indexOf('}, [signature, sourceTodos, expiryClock])', autoStart)
  assert.ok(autoStart >= 0 && autoEnd > autoStart)
  const block = source.slice(autoStart, autoEnd)
  assert.match(block, /deleteExpiredSharedTodo\(profile, todo\.id\)/)
  assert.doesNotMatch(block, /1970-01-01|writeSharedTodo\(profile, tombstone\)/)
})
