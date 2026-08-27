
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('reminder AI uses the verified authenticated S-Hub server transport', () => {
  const source = read('src/firebase-ai.js')
  assert.match(source, /generateSchoolStructured/)
  assert.match(source, /REMINDER_TITLE_RESPONSE_SCHEMA/)
  assert.match(source, /REMINDER_SUMMARY_RESPONSE_SCHEMA/)
  assert.doesNotMatch(source, /school-ai-backend-ruby\.vercel\.app/)
  assert.doesNotMatch(source, /firebase-ai-direct\.js/)
  assert.doesNotMatch(source, /45000/)
})

test('multiple reminder attachments are bounded into individual server requests', () => {
  const source = read('src/firebase-ai.js')
  assert.match(source, /files\.map\(\(file\) => serverReminderResult\(input, now, \[file\]/)
  assert.match(source, /mergeAttachmentResults\(results, files\)/)
})
