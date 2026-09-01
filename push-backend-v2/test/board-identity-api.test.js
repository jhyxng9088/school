import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/board-identity.js', import.meta.url), 'utf8')

test('board identity is derived only from a verified Firebase user', () => {
  assert.match(source, /verifyIdToken\(token\)/)
  assert.match(source, /collection\('users'\)\.doc\(decoded\.uid\)\.get\(\)/)
  assert.match(source, /const classId = String\(value\.classId/)
  assert.match(source, /const studentKey = String\(value\.studentKey/)
  assert.match(source, /const name = String\(value\.name/)
  assert.doesNotMatch(source, /req\.query\?\.(?:class|name|student)/)
})

test('board identity endpoint is private, read-only, and uncached', () => {
  assert.match(source, /req\.method !== 'GET'/)
  assert.match(source, /error: 'missing_auth'/)
  assert.match(source, /Cache-Control', 'no-store'/)
  assert.match(source, /uid: String\(decoded\.uid/)
})
