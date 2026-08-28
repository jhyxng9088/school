import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('hybrid attachment questions opt into cache without changing answer-plus-import UX', () => {
  const ai = read('src/s-hub-ai-engine.js')
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(ai, /answerAndAnalyzeSchoolAttachments/)
  assert.match(ai, /cacheScope: schoolQuestionCacheScope\(text\)/)
  assert.match(sheet, /mode: 'import',\n\s+answer: result\.answer/)
  assert.match(sheet, /추가할 수 있는 항목/)
  assert.match(transport, /cacheScope: cacheScope === 'school-question'/)
})

test('minute-sensitive attachment questions do not use shared cache', () => {
  const ai = read('src/s-hub-ai-engine.js')
  assert.match(ai, /지금\|현재/)
  assert.match(ai, /다음\\s\*교시/)
  assert.match(ai, /\? '' : 'school-question'/)
})

test('shared cache lookup happens only after Firebase auth and student identity verification', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const verifyIndex = endpoint.indexOf('verifyIdToken(token)')
  const identityIndex = endpoint.indexOf("collection('users').doc(decoded.uid).get()")
  const cacheIndex = endpoint.indexOf('readSchoolQuestionCache(db, cacheKey)')
  assert.ok(verifyIndex >= 0 && identityIndex > verifyIndex && cacheIndex > identityIndex)
  assert.match(endpoint, /AI_CACHE_TTL_MS = 10 \* 60 \* 1000/)
  assert.match(endpoint, /createHash\('sha256'\)/)
})

test('cache stores no prompt or attachment bytes and service worker advances', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  assert.match(endpoint, /result: \{ \.\.\.result, cacheHit: false \}/)
  assert.doesNotMatch(endpoint, /prompt:\s*prompt[\s\S]*?createdAtMs/)
  assert.doesNotMatch(endpoint, /dataBase64:[\s\S]*?createdAtMs/)
  assert.match(read('public/sw.js'), /school-shell-v153/)
})
