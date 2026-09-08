import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('reminder summary source owns the body portal after the build owner is retired', () => {
  const source = read('src/reminder-summary.jsx')

  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /return createPortal\([\s\S]*?className="reminder-summary-layer"/)
  assert.match(source, /<\/div>,\s*document\.body,\s*\)\s*\}/)
  assert.equal(fs.existsSync(new URL('../src/preview-ai-reminder-summary-patch.js', import.meta.url)), false)
})

test('preview reminder summary keeps the production sheet geometry and native vertical scroller', () => {
  const css = read('src/reminder-summary.css')

  assert.match(css, /\.reminder-summary-layer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/)
  assert.match(css, /\.reminder-summary-sheet\s*\{[\s\S]*?bottom:\s*0;[\s\S]*?height:\s*calc\(100dvh - max\(10px, env\(safe-area-inset-top\)\)\);/)
  assert.match(css, /\.reminder-summary-scroll\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?-webkit-overflow-scrolling:\s*touch;[\s\S]*?touch-action:\s*pan-y;/)
})

test('AI reminder import source remains owned after adding the summary portal path', () => {
  const main = read('src/main.jsx')

  assert.match(main, /enrichImportedAIReminder/)
  assert.match(main, /createPendingReminderSummary/)
  assert.match(main, /claimSchoolAIReminderSource/)
})
