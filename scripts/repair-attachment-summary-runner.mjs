import fs from 'node:fs'

const path = 'scripts/apply-attachment-summary.mjs'
let source = fs.readFileSync(path, 'utf8')

const oldBlock = `page = page.replaceAll(\n  \`                onDelete={animatePermanentDelete}\\n                key={todo.id}\`,\n  \`                onDelete={animatePermanentDelete}\\n                onOpenSummary={setSummaryTodo}\\n                key={todo.id}\`,\n)\nif ((page.match(/onOpenSummary=\\{setSummaryTodo\\}/g) || []).length !== 2) {\n  throw new Error('summary row handlers: expected two reminder row handlers')\n}`

const newBlock = `let summaryRowHandlerCount = 0\npage = page.replace(\n  /([ \\t]*)onDelete=\\{animatePermanentDelete\\}\\n([ \\t]*)key=\\{todo\\.id\\}/g,\n  (match, actionIndent, keyIndent) => {\n    summaryRowHandlerCount += 1\n    return \`${'${actionIndent}'}onDelete={animatePermanentDelete}\\n${'${actionIndent}'}onOpenSummary={setSummaryTodo}\\n${'${keyIndent}'}key={todo.id}\`\n  },\n)\nif (summaryRowHandlerCount !== 2 || (page.match(/onOpenSummary=\\{setSummaryTodo\\}/g) || []).length !== 2) {\n  throw new Error(\`summary row handlers: expected two reminder row handlers, found ${'${summaryRowHandlerCount}'}\`)\n}`

if (!source.includes(oldBlock)) throw new Error('attachment migration handler guard block not found')
source = source.replace(oldBlock, newBlock)
fs.writeFileSync(path, source)
console.log('Attachment migration row handler guard hardened.')
