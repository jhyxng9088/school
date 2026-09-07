import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

function builtAISheet() {
  return patchPreviewAIPageSource(read('src/s-hub-ai-sheet.jsx'), '/workspace/src/s-hub-ai-sheet.jsx')
}

test('AI page owner directly adds useful quick questions below the real composer', () => {
  const source = builtAISheet()
  assert.match(source, /빠른 질문/)
  assert.match(source, /이번 주 제출/)
  assert.match(source, /내일 시간표/)
  assert.match(source, /다가오는 시험/)
  assert.match(source, /시간표 변경/)
  assert.match(source, /onClick=\{\(\) => setInput\('이번 주에 뭐 제출해야 돼\?'\)\}/)
  assert.match(source, /onClick=\{\(\) => setInput\('내일 시간표 뭐야\?'\)\}/)
})

test('AI page owner directly emits truthful context counts', () => {
  const source = builtAISheet()
  assert.match(source, /AI가 참고하는 정보/)
  assert.match(source, /context\?\.timetable\?\.length \|\| 0/)
  assert.match(source, /context\?\.reminders\?\.length \|\| 0/)
  assert.match(source, /context\?\.academic\?\.length \|\| 0/)
})

test('AI page owner directly owns density responsive CSS', () => {
  const css = patchPreviewAIPageSource(read('src/s-hub-ai.css'), '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.s-hub-ai-page-quick-grid \{[\s\S]*grid-template-columns: repeat\(4/)
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.s-hub-ai-page-quick-grid \{[\s\S]*grid-template-columns: repeat\(2/)
  assert.match(css, /\.s-hub-ai-page-context \{[\s\S]*grid-template-columns: repeat\(3/)
})

test('downstream AI density build owner is retired', () => {
  const vite = read('vite.config.js')
  assert.equal(exists('src/preview-ai-density-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewAIDensitySource/)
  assert.doesNotMatch(vite, /preview-ai-density-patch\.js/)
  assert.match(vite, /patchPreviewAIPageSource\(next, cleanId\)/)
})
