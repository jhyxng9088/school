import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  claimSchoolAIReminderSource,
  clearSchoolAIReminderSources,
  completeSchoolAIReminderSource,
  rememberSchoolAIReminderSources,
} from '../src/s-hub-reminder-source.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub attachment analysis keeps original files only for reminder import claims', () => {
  clearSchoolAIReminderSources()
  const original = new Blob(['notice'], { type: 'image/png' })
  rememberSchoolAIReminderSources([
    { kind: 'reminder', valid: true },
    { kind: 'academic', valid: true },
  ], [original], '수행평가 공지')

  const claim = claimSchoolAIReminderSource()
  assert.ok(claim)
  assert.equal(claim.files.length, 1)
  assert.equal(claim.files[0], original)
  assert.equal(claim.text, '수행평가 공지')
  completeSchoolAIReminderSource(claim.claimId)
  assert.equal(claimSchoolAIReminderSource(), null)
})

test('S-Hub reminder saving reuses reminder AI summary and original attachment pipeline', () => {
  const facade = read('src/s-hub-ai.js')
  const todo = read('src/todo.js')

  assert.match(facade, /rememberSchoolAIReminderSources\(result\?\.items, options\?\.files/)
  assert.match(todo, /s-hub-ai-sheet\.is-open/)
  assert.match(todo, /createPendingReminderSummary/)
  assert.match(todo, /parseReminderWithAI\(promptText, new Date\(\), files\)/)
  assert.match(todo, /uploadOriginalAttachment\(todoId, file, `a\$\{index\}`\)/)
  assert.match(todo, /withAttachmentManifest\(parsed\.summary, files\)/)
  assert.match(todo, /todoData\.enrichTodo\(todoId/)
})
