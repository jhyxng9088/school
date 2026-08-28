import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('academic duplicate reason is converted to polite copy in the app build', () => {
  const config = read('vite.config.js')

  assert.match(config, /\['같은 학사일정이 이미 있어\.', '같은 학사일정이 이미 있어요\.'\]/)
})

test('S-Hub AI edit controls animate open and wait for the closing motion before unmounting', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')

  assert.match(sheet, /className=\{`s-hub-ai-edit \$\{editing \? 'is-done' : ''\}`\.trim\(\)\}/)
  assert.match(sheet, /onClick=\{\(event\) => void toggleEditor\(item\.id, event\)\}/)
  assert.match(sheet, /async function toggleEditor\(id, event\)/)
  assert.match(sheet, /editor\.animate\(\[/)
  assert.match(sheet, /await animation\.finished/)
  assert.match(sheet, /setEditingId\(\(current\) => current === id \? '' : current\)/)
  assert.match(sheet, /prefers-reduced-motion: reduce/)
  assert.match(sheet, /\{editing \? '완료' : '수정'\}/)

  assert.match(css, /\.s-hub-ai-edit[\s\S]*transition:/)
  assert.match(css, /\.s-hub-ai-edit\.is-done[\s\S]*s-hub-ai-edit-done/)
  assert.match(css, /\.s-hub-ai-editor[\s\S]*animation: s-hub-ai-editor-open/)
  assert.match(css, /@keyframes s-hub-ai-editor-open/)
})
