import fs from 'node:fs'

const path = 'scripts/apply-collab-features.mjs'
let source = fs.readFileSync(path, 'utf8')
const startMarker = '  const rowNeedle = '
const endMarker = "  value = value.replaceAll('텍스트는 이해했고, 첨부 내용을 읽는 중…'"
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker, start)
if (start < 0 || end < 0 || end <= start) throw new Error('Guard runner could not locate the reminder-row guard section')
const replacement = `  const rowPattern = /^(\\s*)onOpenSummary=\\{setSummaryTodo\\}\\n\\1key=\\{todo\\.id\\}$/gm
  const rowMatches = [...value.matchAll(rowPattern)]
  if (rowMatches.length !== 2) throw new Error(\`Expected exactly 2 reminder rows, found \${rowMatches.length}\`)
  value = value.replace(rowPattern, (match, indent) =>
    \`\${indent}onOpenSummary={setSummaryTodo}\\n\${indent}attribution={activity[activityKey('reminder', todo.id)] || null}\\n\${indent}key={todo.id}\`)
`
source = source.slice(0, start) + replacement + source.slice(end)
fs.writeFileSync(path, source)
await import(`./apply-collab-features.mjs?run=${Date.now()}`)
