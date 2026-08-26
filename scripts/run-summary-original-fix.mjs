import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const sourcePath = 'scripts/apply-summary-original-fix.mjs'
let source = fs.readFileSync(sourcePath, 'utf8')

const summaryStart = source.indexOf("update('src/reminder-summary.jsx'")
const cssStart = source.indexOf("update('src/reminder-summary.css'")
const todoCssStart = source.indexOf("update('src/todo-stage5.css'")

if (summaryStart < 0 || cssStart < 0 || todoCssStart < 0 || !(summaryStart < cssStart && cssStart < todoCssStart)) {
  throw new Error('Unable to locate summary patch sections')
}

const correctedSummarySections = `update('src/reminder-summary.jsx', (source) => replaceFromMarker(\n  source,\n  'export function SummarySheet',\n  fs.readFileSync('scripts/summary-sheet-tail.txt', 'utf8'),\n  'summary sheet replacement',\n))\n\nupdate('src/reminder-summary.css', (source) => replaceFromMarker(\n  source,\n  '.reminder-summary-layer {',\n  fs.readFileSync('scripts/summary-css-tail.txt', 'utf8'),\n  'summary css replacement',\n))\n\n`

source = source.slice(0, summaryStart) + correctedSummarySections + source.slice(todoCssStart)

const tempPath = '/tmp/apply-summary-original-fix-fixed.mjs'
fs.writeFileSync(tempPath, source)

const result = spawnSync(process.execPath, [tempPath], {
  cwd: process.cwd(),
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
