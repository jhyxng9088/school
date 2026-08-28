import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/class-activity.js', import.meta.url), 'utf8')

test('visible activity labels use honorific actor names and correct verbs', () => {
  assert.match(source, /return `\$\{name\}님이 \$\{verb\}`/)
  assert.match(source, /action === 'added'[\s\S]*?'추가했어요'/)
  assert.match(source, /entityType === 'timetable'[\s\S]*?'변경했어요'/)
  assert.match(source, /'수정했어요'/)
  assert.match(source, /actorActionLabel\(value\.actorName, value\.action, value\.entityType\)/)
})
