import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('only readable reminder summaries render the mini bottom-sheet handle', () => {
  const page = read('src/todo-stage5-ai.jsx')

  assert.match(page, /const readableSummary = Boolean\(todo\.summary && !summaryPending\)/)
  assert.match(page, /\{readableSummary \? \([\s\S]*?className="reminder-summary-handle"/)
  assert.match(page, /aria-label=\{`\$\{todo\.title\} 요약 열기`\}/)
  assert.match(page, /className="reminder-summary-handle-grip"/)
  assert.match(page, /className="reminder-summary-handle-sheet"/)
  assert.match(page, /onClick=\{\(\) => onOpenSummary\(todo\)\}/)
})

test('summary handle is a 16px modal glyph with desktop hover and a 2px pressed lift', () => {
  const css = read('src/reminder-summary.css')

  assert.match(css, /\.reminder-summary-handle-icon\s*\{[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;/)
  assert.match(css, /\.reminder-summary-handle-grip\s*\{[\s\S]*?width:\s*6px;[\s\S]*?height:\s*2px;/)
  assert.match(css, /\.reminder-summary-handle-sheet\s*\{[\s\S]*?width:\s*14px;[\s\S]*?height:\s*10px;/)
  assert.match(css, /\.reminder-summary-handle:active\s*\{[\s\S]*?translate3d\(0, -2px, 0\)/)
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.reminder-summary-handle:hover[\s\S]*?translate3d\(0, -1px, 0\)/)
})
