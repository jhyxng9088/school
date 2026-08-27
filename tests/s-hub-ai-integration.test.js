import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('S-Hub AI stays a home sheet and does not add a sixth navigation tab', () => {
  const main = read('src/main.jsx')
  const sheet = read('src/s-hub-ai-sheet.jsx')

  assert.match(main, /import \{ SchoolAISheet \} from '\.\/s-hub-ai-sheet\.jsx'/)
  assert.match(main, /<SchoolAISheet/)
  assert.match(main, /className="home-ai-trigger"/)
  assert.doesNotMatch(main, /\{ id: 'ai'/)
  assert.match(sheet, /<UnifiedBottomSheet/)
})

test('AI writes are routed through existing app save functions', () => {
  const main = read('src/main.jsx')

  assert.match(main, /todoData\.saveTodo\(/)
  assert.match(main, /academicData\.saveEvent\(/)
  assert.match(main, /commitOverrides\(/)
})

test('normal reminder saving runs the conflict check before save', () => {
  const todo = read('src/todo-stage5-ai.jsx')

  assert.match(todo, /findReminderConflict/)
  assert.match(todo, /confirmReminderConflict/)
  assert.match(todo, /reminder-conflict-warning/)
})

test('structured AI helper and attachment preparation are explicitly exported', () => {
  const direct = read('src/firebase-ai-direct.js')
  const firebaseAI = read('src/firebase-ai.js')

  assert.match(direct, /export async function generateDirectStructured/)
  assert.match(firebaseAI, /export async function prepareAttachment/)
})
