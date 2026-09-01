import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preview reminder summary escapes transformed station ancestors without changing the shared source', () => {
  const source = read('src/reminder-summary.jsx')
  const transformed = patchPreviewAIReminderSummarySource(source, '/virtual/src/reminder-summary.jsx')

  assert.doesNotMatch(source, /createPortal/)
  assert.match(transformed, /import \{ createPortal \} from 'react-dom'/)
  assert.match(transformed, /return createPortal\([\s\S]*?className="reminder-summary-layer"/)
  assert.match(transformed, /<\/div>,\s*document\.body,\s*\)\s*\}/)
})

test('preview reminder summary keeps the production sheet geometry and native vertical scroller', () => {
  const css = read('src/reminder-summary.css')

  assert.match(css, /\.reminder-summary-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/)
  assert.match(css, /\.reminder-summary-sheet\s*\{[\s\S]*?bottom:\s*0;[\s\S]*?height:\s*calc\(100dvh - max\(10px, env\(safe-area-inset-top\)\)\);/)
  assert.match(css, /\.reminder-summary-scroll\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?-webkit-overflow-scrolling:\s*touch;[\s\S]*?touch-action:\s*pan-y;/)
})

test('AI reminder import transform still applies after adding the summary portal path', () => {
  const main = read('src/main.jsx')
  const transformed = patchPreviewAIReminderSummarySource(main, '/virtual/src/main.jsx')

  assert.match(transformed, /enrichImportedAIReminder/)
  assert.match(transformed, /createPendingReminderSummary/)
  assert.match(transformed, /claimSchoolAIReminderSource/)
})
