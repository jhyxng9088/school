import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('attachment questions return answer and actionable items in one AI call', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /ATTACHMENT_HYBRID_SCHEMA/)
  assert.match(ai, /required: \['answer', 'items'\]/)
  assert.match(ai, /answerAndAnalyzeSchoolAttachments/)
  assert.match(ai, /responseSchema: ATTACHMENT_HYBRID_SCHEMA/)
  assert.match(ai, /answer와 items는 서로 배타적이지 않다/)
  assert.match(ai, /items: normalizeImportItems\(generated\?\.value, now\)/)
})

test('attachment question UI keeps answer and import candidates together', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /answerAndAnalyzeSchoolAttachments/)
  assert.match(sheet, /mode: 'import',\n\s+answer: result\.answer/)
  assert.match(sheet, /!working && state\.answer/)
  assert.match(sheet, /추가할 수 있는 항목/)
  assert.match(sheet, /reviewSchoolImportConflicts\(items, conflictContext/)
  assert.match(sheet, /질문에 답할 내용을 정리하는 중…/)
})

test('service worker advances for hybrid attachment answers', () => {
  assert.match(read('public/sw.js'), /school-shell-v153/)
})
