import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/reminder-scheduled.js', import.meta.url), 'utf8')

test('scheduled reminders query only candidate dates inside subscribed classes', () => {
  assert.match(source, /queryCollectionByValues\(classRef\.collection\('todos'\), 'dueDate', todoDates\)/)
  assert.match(source, /queryCollectionByValues\(classRef\.collection\('academicEvents'\), 'startDate', academicDates\)/)
  assert.doesNotMatch(source, /classRef\.collection\('todos'\)\.get\(\)/)
  assert.doesNotMatch(source, /classRef\.collection\('academicEvents'\)\.get\(\)/)
})

test('scheduled reminders keep the existing subscription discovery without adding collection-group indexes', () => {
  assert.match(source, /collectionGroup\('pushSubscriptions'\)\.get\(\)/)
  assert.doesNotMatch(source, /collectionGroup\('todos'\)\.where/)
  assert.doesNotMatch(source, /collectionGroup\('academicEvents'\)\.where/)
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