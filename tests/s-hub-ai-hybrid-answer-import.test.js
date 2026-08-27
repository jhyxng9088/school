import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('attachment questions request one structured answer plus import items', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /ATTACHMENT_QUESTION_SCHEMA/)
  assert.match(ai, /required: \['answer', 'items'\]/)
  assert.match(ai, /items: normalizeImportItems/)
  assert.match(ai, /cacheScope: schoolQuestionCacheScope\(text\)/)
  assert.match(ai, /질문의 범위와 무관하게 첨부 전체에서 실제로 S-Hub에 등록할 가치가 있는 학교 정보를 최대 10개 추출/)
})

test('hybrid result renders answer and the existing import review together', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /mode: 'hybrid'/)
  assert.match(sheet, /state\.mode === 'answer' \|\| state\.mode === 'hybrid'/)
  assert.match(sheet, /state\.mode === 'import' \|\| state\.mode === 'hybrid'/)
  assert.match(sheet, /reviewSchoolImportConflicts\(items, conflictContext, now, \{ signal: controller\.signal \}\)/)
  assert.match(sheet, /\(state\.mode === 'import' \|\| state\.mode === 'hybrid'\) \? \(/)
})

test('shared school-question cache is authenticated, short-lived and request-content keyed', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(endpoint, /AI_CACHE_TTL_MS = 10 \* 60 \* 1000/)
  assert.match(endpoint, /createHash\('sha256'\)/)
  assert.match(endpoint, /normalizedPromptForCache/)
  assert.match(endpoint, /verifyIdToken\(token\)/)
  assert.match(endpoint, /readSchoolQuestionCache\(db, cacheKey\)/)
  assert.match(endpoint, /writeSchoolQuestionCache\(db, cacheKey, result\)/)
  assert.doesNotMatch(endpoint, /prompt:\s*prompt.*AI_CACHE_COLLECTION/s)
  assert.match(transport, /cacheScope: cacheScope === 'school-question'/)
})

test('time-sensitive attachment questions opt out of shared caching', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /지금\|현재/)
  assert.match(ai, /다음\\s\*교시/)
  assert.match(ai, /\? '' : 'school-question'/)
})

test('service worker advances for hybrid answer and import UX', () => {
  assert.match(read('public/sw.js'), /school-shell-v152/)
})
