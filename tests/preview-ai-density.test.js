import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function builtAISheet() {
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIDensitySource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  return source
}

test('AI page adds useful quick questions below the real composer', () => {
  const source = builtAISheet()
  assert.match(source, /빠른 질문/)
  assert.match(source, /이번 주 제출/)
  assert.match(source, /내일 시간표/)
  assert.match(source, /다가오는 시험/)
  assert.match(source, /시간표 변경/)
  assert.match(source, /onClick=\{\(\) => setInput\('이번 주에 뭐 제출해야 돼\?'\)\}/)
  assert.match(source, /onClick=\{\(\) => setInput\('내일 시간표 뭐야\?'\)\}/)
})

test('AI page context strip uses live AI context counts rather than fake values', () => {
  const source = builtAISheet()
  assert.match(source, /AI가 참고하는 정보/)
  assert.match(source, /context\?\.timetable\?\.length \|\| 0/)
  assert.match(source, /context\?\.reminders\?\.length \|\| 0/)
  assert.match(source, /context\?\.academic\?\.length \|\| 0/)
})

test('AI density is four-column on wide screens and two-column on phones', () => {
  let css = read('src/s-hub-ai.css')
  css = patchPreviewAIPageSource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIDensitySource(css, '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.s-hub-ai-page-quick-grid \{[\s\S]*grid-template-columns: repeat\(4/)
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.s-hub-ai-page-quick-grid \{[\s\S]*grid-template-columns: repeat\(2/)
  assert.match(css, /\.s-hub-ai-page-context \{[\s\S]*grid-template-columns: repeat\(3/)
})

test('vite applies AI density after the full AI page patch', () => {
  const vite = read('vite.config.js')
  const page = vite.indexOf('patchPreviewAIPageSource(next, cleanId)')
  const density = vite.indexOf('patchPreviewAIDensitySource(next, cleanId)')
  assert.ok(page >= 0)
  assert.ok(density > page)
})
