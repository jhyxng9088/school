import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

function applyPreviewAI(source, id) {
  let next = patchPreviewAIPageSource(source, id)
  next = patchPreviewAIDensitySource(next, id)
  next = patchPreviewAIStageMotionSource(next, id)
  return next
}

test('AI quick questions animate into the composer instead of snapping in', () => {
  const source = fs.readFileSync(new URL('../src/s-hub-ai-sheet.jsx', import.meta.url), 'utf8')
  const output = applyPreviewAI(source, '/src/s-hub-ai-sheet.jsx')

  assert.match(output, /const \[quickFillNonce, setQuickFillNonce\] = useState\(0\)/)
  assert.match(output, /function applyQuickQuestion\(value\)/)
  assert.match(output, /key={`quick-fill-\$\{quickFillNonce\}`}/)
  assert.match(output, /quickFillNonce \? 'is-quick-fill' : ''/)
  assert.match(output, /applyQuickQuestion\('이번 주에 뭐 제출해야 돼\?'\)/)
  assert.match(output, /applyQuickQuestion\('내일 시간표 뭐야\?'\)/)
  assert.match(output, /applyQuickQuestion\('다음 시험 언제야\?'\)/)
  assert.match(output, /applyQuickQuestion\('이번 주 시간표 바뀐 거 있어\?'\)/)
})

test('AI page uses a consistent vertical rhythm across headings, buttons and context cards', () => {
  const source = fs.readFileSync(new URL('../src/s-hub-ai.css', import.meta.url), 'utf8')
  const output = applyPreviewAI(source, '/src/s-hub-ai.css')

  assert.match(output, /Preview-only AI rhythm polish/)
  assert.match(output, /\.s-hub-ai-page-extra > section \{\s*display: grid;\s*gap: 9px;/)
  assert.match(output, /\.s-hub-ai-page-extra \{\s*gap: 23px;\s*margin-top: 23px;/)
  assert.match(output, /@keyframes s-hub-ai-quick-fill/)
  assert.match(output, /text-indent: 7px;/)
  assert.match(output, /animation: s-hub-ai-quick-fill 440ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both;/)
})
