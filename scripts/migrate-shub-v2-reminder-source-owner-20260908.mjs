import fs from 'node:fs'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, value) => fs.writeFileSync(path, value)

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`S-Hub V2 reminder migration marker missing: ${label}`)
  return source.replace(marker, replacement)
}

const todoPath = 'src/todo-stage5-ai.jsx'
const patchPath = 'src/preview-s-hub-v2-patch.js'
const vitePath = 'vite.config.js'
const effectTestPath = 'tests/build-patch-effect.test.js'
const ownerTestPath = 'tests/shub-v2-main-source-owner.test.js'

const todo = read(todoPath)
const migratedTodo = patchPreviewSHubV2Source(todo, '/workspace/src/todo-stage5-ai.jsx')
if (migratedTodo === todo) throw new Error('S-Hub V2 reminder-section migration had no effect')
write(todoPath, migratedTodo)

let vite = read(vitePath)
vite = replaceRequired(
  vite,
  "import { patchPreviewSHubV2Source } from './src/preview-s-hub-v2-patch.js'\n",
  '',
  'Vite patch import',
)
vite = replaceRequired(
  vite,
  '  next = patchPreviewSHubV2Source(next, cleanId)\n',
  '',
  'Vite patch call',
)
vite = replaceRequired(
  vite,
  "        || cleanId.endsWith('/preview-s-hub-v2-patch.js')\n",
  '',
  'polite-copy patch exclusion',
)
write(vitePath, vite)

let effectTest = read(effectTestPath)
effectTest = replaceRequired(
  effectTest,
  "  ['patchPreviewSHubV2Source', 'preview-s-hub-v2-patch.js'],\n",
  '',
  'direct build patch effect definition',
)
write(effectTestPath, effectTest)

write(ownerTestPath, `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { existsSync, readFileSync } from 'node:fs'\nimport { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'\n\nconst read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')\n\ntest('S-Hub V2 tab scroll reset is owned by raw main source', () => {\n  const main = read('src/main.jsx')\n  assert.match(main, /const resetScroll = \\(\\) => \\{/)\n  assert.match(main, /window\\.scrollTo\\(0, 0\\)/)\n  assert.match(main, /requestAnimationFrame\\(resetScroll\\)/)\n  assert.match(main, /\\}, \\[activeTab\\]\\)/)\n})\n\ntest('S-Hub V2 reminder section management is owned by raw todo source', () => {\n  const todo = read('src/todo-stage5-ai.jsx')\n  assert.match(todo, /CUSTOM_REMINDER_CATEGORY_COLORS/)\n  assert.match(todo, /reminderFilterOptions\\(categories\\)/)\n  assert.match(todo, /saveReminderSectionChange/)\n  assert.match(todo, /function beginSectionPress/)\n  assert.match(todo, /function submitSectionEdit/)\n  assert.match(todo, /function deleteSectionFromAction/)\n  assert.notEqual(patchPreviewReminderPolishSource(todo, '/workspace/src/todo-stage5-ai.jsx'), todo)\n})\n\ntest('retired S-Hub V2 build patch stays out of the production build graph', () => {\n  const vite = read('vite.config.js')\n  assert.equal(existsSync(new URL('../src/preview-s-hub-v2-patch.js', import.meta.url)), false)\n  assert.doesNotMatch(vite, /patchPreviewSHubV2Source/)\n  assert.doesNotMatch(vite, /preview-s-hub-v2-patch\\.js/)\n  assert.match(vite, /patchPreviewReminderPolishSource/)\n})\n`)

fs.unlinkSync(patchPath)
