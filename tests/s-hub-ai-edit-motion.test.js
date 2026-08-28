import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('academic duplicate reason is converted to polite copy in the app build', () => {
  const config = read('vite.config.js')

  assert.match(config, /\['같은 학사일정이 이미 있어\.', '같은 학사일정이 이미 있어요\.'\]/)
})

test('S-Hub AI edit controls animate without changing edit state logic', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')

  assert.match(sheet, /className=\{`s-hub-ai-edit \$\{editing \? 'is-done' : ''\}`\.trim\(\)\}/)
  assert.match(sheet, /onClick=\{\(\) => setEditingId\(editing \? '' : item\.id\)\}/)
  assert.match(sheet, /\{editing \? '완료' : '수정'\}/)

  assert.match(css, /\.s-hub-ai-edit[\s\S]*transition:/)
  assert.match(css, /\.s-hub-ai-edit\.is-done[\s\S]*s-hub-ai-edit-done/)
  assert.match(css, /\.s-hub-ai-editor[\s\S]*animation: s-hub-ai-editor-open/)
  assert.match(css, /@keyframes s-hub-ai-editor-open/)
})
