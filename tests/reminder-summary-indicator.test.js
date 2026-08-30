import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function builtReminderPage() {
  const source = read('src/todo-stage5-ai.jsx')
  const withSections = patchPreviewSHubV2Source(source, '/workspace/src/todo-stage5-ai.jsx')
  return patchPreviewReminderPolishSource(withSections, '/workspace/src/todo-stage5-ai.jsx')
}

test('readable summaries use a compact badge beside the reminder type instead of the right action rail', () => {
  const page = builtReminderPage()

  assert.match(page, /const readableSummary = Boolean\(todo\.summary && !summaryPending\)/)
  assert.match(page, /className="todo-kind"[\s\S]*?className="reminder-summary-badge"[\s\S]*?<span>요약<\/span>/)
  assert.doesNotMatch(page, /className="reminder-summary-handle"/)
  assert.match(page, /className="todo-item-main has-summary"[\s\S]*?onClick=\{\(\) => onOpenSummary\(todo\)\}/)
})

test('summary badge stays visually small and does not occupy date or edit-button spacing', () => {
  const css = read('src/preview-reminder-polish.css')
  const page = builtReminderPage()

  assert.match(css, /\.reminder-summary-badge\s*\{[\s\S]*?height:\s*18px;[\s\S]*?padding:\s*0 6px;/)
  assert.match(css, /\.reminder-summary-badge-mark\s*\{[\s\S]*?width:\s*4px;[\s\S]*?height:\s*4px;/)
  const actionRail = page.match(/<div className="todo-row-actions">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.doesNotMatch(actionRail, /reminder-summary-badge|reminder-summary-handle/)
})