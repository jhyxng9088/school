import fs from 'node:fs'

const path = 'scripts/apply-collab-features.mjs'
let source = fs.readFileSync(path, 'utf8')
const from = `  const rowNeedle = \`                onOpenSummary={setSummaryTodo}\\n                key={todo.id}\`
  const rowReplacement = \`                onOpenSummary={setSummaryTodo}\\n                attribution={activity[activityKey('reminder', todo.id)] || null}\\n                key={todo.id}\`
  const first = value.indexOf(rowNeedle)
  if (first < 0) throw new Error('Missing guard: first reminder row')
  value = value.slice(0, first) + rowReplacement + value.slice(first + rowNeedle.length)
  const second = value.indexOf(rowNeedle, first + rowReplacement.length)
  if (second < 0) throw new Error('Missing guard: second reminder row')
  value = value.slice(0, second) + rowReplacement + value.slice(second + rowNeedle.length)
  if (value.indexOf(rowNeedle) >= 0) throw new Error('Unexpected extra reminder rows')`
const to = `  const rowPattern = /^(\\s*)onOpenSummary=\\{setSummaryTodo\\}\\n\\1key=\\{todo\\.id\\}$/gm
  const rowMatches = [...value.matchAll(rowPattern)]
  if (rowMatches.length !== 2) throw new Error(\`Expected exactly 2 reminder rows, found \${rowMatches.length}\`)
  value = value.replace(rowPattern, (match, indent) =>
    \`\${indent}onOpenSummary={setSummaryTodo}\\n\${indent}attribution={activity[activityKey('reminder', todo.id)] || null}\\n\${indent}key={todo.id}\`)
`
if (!source.includes(from)) throw new Error('Guard runner could not locate the old reminder-row guard')
source = source.replace(from, to)
fs.writeFileSync(path, source)
await import(`./apply-collab-features.mjs?run=${Date.now()}`)
