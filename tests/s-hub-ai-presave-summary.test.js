import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { groupSchoolAIImportItems, reviewKnownSchoolImportConflicts } from '../src/s-hub-ai-import-guard.js'

test('grouped material reminder retains concrete material hints for the pre-save summary', () => {
  const [item] = groupSchoolAIImportItems([
    { id: 'm1', kind: 'reminder', type: 'material', title: '컴퍼스 가져오기', dueDate: '2026-09-02', dueTime: '', confidence: 'high', valid: true },
    { id: 'm2', kind: 'reminder', type: 'material', title: '자 챙기기', dueDate: '2026-09-02', dueTime: '', confidence: 'high', valid: true },
    { id: 'm3', kind: 'reminder', type: 'material', title: '연필 지참', dueDate: '2026-09-02', dueTime: '', confidence: 'high', valid: true },
  ])

  assert.deepEqual(item.materialItems, ['컴퍼스', '자', '연필'])
  assert.match(item.title, /컴퍼스/)
  assert.match(item.title, /연필/)
})

test('known conflict guard tolerates malformed context collections instead of crashing the review screen', () => {
  const conflicts = reviewKnownSchoolImportConflicts([
    { id: 'exam', kind: 'reminder', type: 'exam', title: '9월 모의고사', dueDate: '2026-09-02', valid: true },
  ], {
    academic: () => [],
    reminders: null,
  })

  assert.deepEqual(conflicts, {})
})

test('preview AI creates summaries before import and renders them on the review card', () => {
  const ai = readFileSync(new URL('../src/s-hub-ai.js', import.meta.url), 'utf8')
  const pagePatch = readFileSync(new URL('../src/preview-ai-page-patch.js', import.meta.url), 'utf8')
  const summaryPatch = readFileSync(new URL('../src/preview-ai-reminder-summary-patch.js', import.meta.url), 'utf8')

  assert.match(ai, /PREVIEW_SUMMARY_SCHEMA/)
  assert.match(ai, /summarizeSchoolAIImportItems/)
  assert.match(ai, /previewSummary/)
  assert.match(ai, /typeof review !== 'function'/)
  assert.match(pagePatch, /AI 요약/)
  assert.match(pagePatch, /s-hub-ai-item-summary/)
  assert.match(summaryPatch, /const previewSummary = item\?\.previewSummary\?\.overview/)
  assert.match(summaryPatch, /let parsed = previewSummary \? \{ summary: previewSummary, attachment: null \} : null/)
})
