import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/class-roster-repair.js', import.meta.url), 'utf8')

test('roster repair is authenticated and derives the class from the signed-in identity', () => {
  assert.match(source, /req\.method !== 'POST'/)
  assert.match(source, /verifyIdToken\(token\)/)
  assert.match(source, /collection\('users'\)\.doc\(decoded\.uid\)\.get\(\)/)
  assert.match(source, /const classId = String\(identity\.data\(\)\?\.classId/)
  assert.doesNotMatch(source, /req\.query\?\.class/)
})

test('roster repair checks every remaining identity signal before archiving', () => {
  assert.match(source, /collection\('pushSubscriptions'\)\.get\(\)/)
  assert.match(source, /collection\('todoState'\)/)
  assert.match(source, /recoverClassRosterUsers\(\{/)
  assert.match(source, /classifyRosterOrphans\(\{/)
})

test('roster repair archives before deleting an unresolved active member record', () => {
  assert.match(source, /collection\('rosterArchive'\)\.doc\(item\.studentKey\)/)
  assert.match(source, /reason: 'unresolved_legacy_member'/)
  assert.match(source, /batch\.delete\(classRef\.collection\('members'\)\.doc\(item\.studentKey\)\)/)
  assert.match(source, /await batch\.commit\(\)/)
})
