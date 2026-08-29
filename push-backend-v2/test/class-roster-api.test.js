import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/class-roster.js', import.meta.url), 'utf8')

test('class roster API derives the class from the authenticated identity', () => {
  assert.match(source, /verifyIdToken\(token\)/)
  assert.match(source, /collection\('users'\)\.doc\(decoded\.uid\)\.get\(\)/)
  assert.match(source, /const classId = String\(identity\.data\(\)\?\.classId/)
  assert.doesNotMatch(source, /req\.query\?\.class/)
})

test('class roster API only includes student keys already present in the class member set', () => {
  assert.match(source, /classRef\.collection\('members'\)\.get\(\)/)
  assert.match(source, /const memberKeys = new Set/)
  assert.match(source, /memberKeys\.has\(String\(user\?\.studentKey/)
  assert.match(source, /missingIdentityCount/)
  assert.match(source, /unresolved: roster\.unresolved \+ missingIdentityCount/)
})

test('class roster API remains private behind a bearer token and disables caching', () => {
  assert.match(source, /Access-Control-Allow-Headers', 'authorization, content-type'/)
  assert.match(source, /Cache-Control', 'no-store'/)
  assert.match(source, /error: 'missing_auth'/)
})
