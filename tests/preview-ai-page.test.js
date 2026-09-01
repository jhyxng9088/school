import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('AI sheet gains an inline page mode without losing the existing modal workflow', () => {
  const source = patchPreviewAIPageSource(read('src/s-hub-ai-sheet.jsx'), '/workspace/src/s-hub-ai-sheet.jsx')
  assert.match(source, /inline = false/)
  assert.match(source, /className="s-hub-ai-page"/)
  assert.match(source, /className="s-hub-ai-page-stop"/)
  assert.match(source, /<UnifiedBottomSheet/)
  assert.match(source, /analyzeSchoolNotice/)
  assert.match(source, /askSchoolHub/)
  assert.match(source, /answerAndAnalyzeSchoolAttachments/)
  assert.match(source, /reviewSchoolImportConflicts/)
  assert.match(source, /onImportItems\(ready\)/)
  assert.match(source, /사진·파일/)
  assert.match(source, /기존 수정/)
  assert.match(source, /그래도 추가/)
})

test('AI page exposes question, attachment analysis, and direct schedule import capabilities', () => {
  const source = patchPreviewAIPageSource(read('src/s-hub-ai-sheet.jsx'), '/workspace/src/s-hub-ai-sheet.jsx')
  assert.match(source, /학교 정보 질문/)
  assert.match(source, /공지·파일 분석/)
  assert.match(source, /일정으로 바로 추가/)
  assert.match(source, /최대 4개/)
})

test('AI station renders the inline workflow and no longer opens the modal on tab selection', () => {
  const representative = `
function PreviewAIPage({ onOpenAI }) {
  return <button onClick={onOpenAI}>AI 열기</button>
}

/* Preview-only schedule segment: intentionally reuses useClassTopSegmentSpring. */
function ScheduleTopSegment() {}

const pages = {
    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,
}

function commitStationTab(nextTab) {
    if (nextTab === 'ai') setAiOpen(true)
    setActiveTab(nextTab)
}
`
  const source = patchPreviewAIPageSource(representative, '/workspace/src/main.jsx')
  assert.match(source, /function PreviewAIPage\(\{ now, context, conflictContext, onImportItems, requireOnline \}\)/)
  assert.match(source, /<SchoolAISheet[\s\S]*inline[\s\S]*open=\{true\}/)
  assert.match(source, /context=\{aiContext\}/)
  assert.match(source, /conflictContext=\{aiConflictContext\}/)
  assert.match(source, /onImportItems=\{importAIItems\}/)
  assert.doesNotMatch(source, /if \(nextTab === 'ai'\) setAiOpen\(true\)/)
})

test('AI page styling is a normal page card, not a fixed sheet', () => {
  const css = patchPreviewAIPageSource(read('src/s-hub-ai.css'), '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.s-hub-ai-page \{[\s\S]*width: min\(100%, 720px\)/)
  assert.match(css, /\.s-hub-ai-page-capabilities \{[\s\S]*grid-template-columns: repeat\(3/)
  assert.match(css, /\.s-hub-ai-page > \.s-hub-ai-content/)
})

test('vite applies the AI page layer after station and schedule transformations', () => {
  const vite = read('vite.config.js')
  const schedule = vite.indexOf('patchPreviewScheduleTopSegmentSource(next, cleanId)')
  const aiPage = vite.indexOf('patchPreviewAIPageSource(next, cleanId)')
  assert.ok(schedule >= 0)
  assert.ok(aiPage > schedule)
})
