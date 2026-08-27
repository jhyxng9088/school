import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

test('S-Hub AI is the single user-facing AI name across school and reminder flows', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const reminder = read('src/todo-stage5-ai.jsx')
  assert.match(sheet, /title="S-Hub AI"/)
  assert.match(reminder, /S-Hub AI가 첨부를 분석 중/)
  assert.doesNotMatch(reminder, /첨부에서 제목을 찾는 중|제목 분석 중|전체 요약도 동시에 시작했어/)
})

test('running S-Hub AI can be closed and is treated as cancellation', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(sheet, /requestControllerRef\.current\?\.abort\(\)/)
  assert.match(sheet, /closeDisabled=\{saving\}/)
  assert.doesNotMatch(sheet, /closeDisabled=\{working\}/)
  assert.match(transport, /school-ai\/cancelled/)
  assert.match(transport, /purpose: purpose === 'reminder' \? 'reminder' : 'school'/)
})

test('S-Hub import rows expose destination and only one review warning', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /return `리마인더 · \$\{type\}`/)
  assert.match(sheet, /function itemReviewLabel/)
  assert.doesNotMatch(sheet, /return '날짜 확인 필요'\n  return `\$\{month\}\/\$\{day\}`/)
  assert.match(sheet, /className=\{`s-hub-ai-edit \$\{editing \? 'is-done' : ''\}`/)
})

test('S-Hub editor uses iOS-safe native date and time shells', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /NativeDateField label="날짜"/)
  assert.match(sheet, /NativeTimeField label="시간"/)
  assert.match(css, /\.s-hub-ai-native-control > input\[type="date"\]/)
  assert.match(css, /-webkit-text-fill-color: transparent/)
})

test('reminder analysis declares reminder purpose on the shared S-Hub backend', () => {
  const reminderAI = read('src/firebase-ai.js')
  const api = read('push-backend-v2/api/s-hub-ai.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')
  assert.match(reminderAI, /purpose: 'reminder'/)
  assert.match(api, /body\.purpose === 'reminder'/)
  assert.match(service, /REMINDER_ATTACHMENT_MODELS/)
  assert.match(service, /purpose === 'reminder' \? REMINDER_ATTACHMENT_MODELS : ATTACHMENT_MODELS/)
})
