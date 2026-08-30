import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/class-roster.js', import.meta.url), 'utf8')

test('reminder section API accepts authenticated production and preview class ids', () => {
  assert.match(source, /function isReminderSectionClassId\(value\)/)
  assert.match(source, /\^\(\?:preview-\)\?class-/)
  assert.match(source, /if \(!isReminderSectionClassId\(classId\)\)/)
  assert.doesNotMatch(source, /preview-class-required/)
})

test('reminder section API still derives the target class from verified user identity', () => {
  assert.match(source, /verifyIdToken\(token\)/)
  assert.match(source, /db\.collection\('users'\)\.doc\(decoded\.uid\)\.get\(\)/)
  assert.match(source, /const classId = String\(identity\.data\(\)\?\.classId/)
  assert.doesNotMatch(source, /body\?\.classId/)
})
