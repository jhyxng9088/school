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

test('shared AI transport and attachment preparation are explicitly exported', () => {
  const transport = read('src/s-hub-ai-transport.js')
  const firebaseAI = read('src/firebase-ai.js')

  assert.match(transport, /export async function generateSchoolStructured/)
  assert.match(firebaseAI, /export async function prepareAttachment/)
  assert.doesNotMatch(transport, /firebase-ai-direct/)
})

test('duplicate checks use class-shared reminders instead of personal completion state', () => {
  const main = read('src/main.jsx')
  const todo = read('src/todo.jsx')
  const todoAI = read('src/todo-stage5-ai.jsx')

  assert.match(todo, /sharedTodos,/)
  assert.match(main, /todoData\.sharedTodos/)
  assert.match(main, /conflictContext=\{aiConflictContext\}/)
  assert.match(todoAI, /sharedTodos \|\| todos/)
})
