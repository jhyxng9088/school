import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/reminder-scheduled.js', import.meta.url), 'utf8')

test('scheduled reminders query candidate dates before loading class data', () => {
  assert.match(source, /collectionGroup\(collectionName\)\.where\(fieldName, '==', cleanValues\[0\]\)/)
  assert.match(source, /queryCollectionGroupByValues\(db, 'todos', 'dueDate', todoDates\)/)
  assert.match(source, /queryCollectionGroupByValues\(db, 'academicEvents', 'startDate', academicDates\)/)
})

test('scheduled reminders no longer scan every push subscription globally', () => {
  assert.doesNotMatch(source, /collectionGroup\(['"]pushSubscriptions['"]\)\.get\(\)/)
  assert.match(source, /collection\('classes'\)\.doc\(classId\)\.collection\('pushSubscriptions'\)\.get\(\)/)
})

test('scheduled reminders only request todoState documents for candidate todo ids', () => {
  assert.doesNotMatch(source, /collection\('todoState'\)\.get\(\)/)
  assert.match(source, /collection\('todoState'\)\.doc\(todoId\)/)
  assert.match(source, /db\.getAll\(/)
})

test('scheduler remembers the last successful scan to avoid repeating two hours every five minutes', () => {
  assert.match(source, /scheduledPushRuntime/)
  assert.match(source, /scheduleLookbackMs\(lastSuccessMs, nowMs\)/)
  assert.match(source, /lastSuccessMs:\s*nowMs/)
})