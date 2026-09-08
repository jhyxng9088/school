import fs from 'node:fs'
import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, value) => fs.writeFileSync(path, value)

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Reminder polish migration marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function updateRequired(path, updates) {
  let source = read(path)
  for (const [marker, replacement, label] of updates) {
    source = replaceRequired(source, marker, replacement, `${path}: ${label}`)
  }
  write(path, source)
}

const todoPath = 'src/todo-stage5-ai.jsx'
const patchPath = 'src/preview-reminder-polish-patch.js'
const vitePath = 'vite.config.js'

const todo = read(todoPath)
const migratedTodo = patchPreviewReminderPolishSource(todo, '/workspace/src/todo-stage5-ai.jsx')
if (migratedTodo === todo) throw new Error('Reminder polish source-owner migration had no effect')
write(todoPath, migratedTodo)

updateRequired(vitePath, [
  ["import { patchPreviewReminderPolishSource } from './src/preview-reminder-polish-patch.js'\n", '', 'remove patch import'],
  ['  next = patchPreviewReminderPolishSource(next, cleanId)\n', '', 'remove patch call'],
  ["        || cleanId.endsWith('/preview-reminder-polish-patch.js')\n", '', 'remove polite-copy exclusion'],
])

updateRequired('tests/build-patch-effect.test.js', [
  ["  ['patchPreviewReminderPolishSource', 'preview-reminder-polish-patch.js'],\n", '', 'remove direct build patch definition'],
])

write('tests/shub-v2-main-source-owner.test.js', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { existsSync, readFileSync } from 'node:fs'\n\nconst read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')\n\ntest('S-Hub V2 tab scroll reset is owned by raw main source', () => {\n  const main = read('src/main.jsx')\n  assert.match(main, /const resetScroll = \\(\\) => \\{/)\n  assert.match(main, /window\\.scrollTo\\(0, 0\\)/)\n  assert.match(main, /requestAnimationFrame\\(resetScroll\\)/)\n  assert.match(main, /\\}, \\[activeTab\\]\\)/)\n})\n\ntest('S-Hub V2 reminder section and polish behavior are owned by raw todo source', () => {\n  const todo = read('src/todo-stage5-ai.jsx')\n  assert.match(todo, /CUSTOM_REMINDER_CATEGORY_COLORS/)\n  assert.match(todo, /reminderFilterOptions\\(categories\\)/)\n  assert.match(todo, /saveReminderSectionChange/)\n  assert.match(todo, /function beginSectionPress/)\n  assert.match(todo, /function submitSectionEdit/)\n  assert.match(todo, /function deleteSectionFromAction/)\n  assert.match(todo, /const hiddenBuiltinSections = useMemo/)\n  assert.match(todo, /const categoryRestoreTarget = useMemo/)\n  assert.match(todo, /className="reminder-summary-badge"/)\n  assert.doesNotMatch(todo, /className="reminder-summary-handle"/)\n})\n\ntest('retired S-Hub V2 and reminder polish build patches stay out of the production build graph', () => {\n  const vite = read('vite.config.js')\n  assert.equal(existsSync(new URL('../src/preview-s-hub-v2-patch.js', import.meta.url)), false)\n  assert.equal(existsSync(new URL('../src/preview-reminder-polish-patch.js', import.meta.url)), false)\n  assert.doesNotMatch(vite, /patchPreviewSHubV2Source/)\n  assert.doesNotMatch(vite, /preview-s-hub-v2-patch\\.js/)\n  assert.doesNotMatch(vite, /patchPreviewReminderPolishSource/)\n  assert.doesNotMatch(vite, /preview-reminder-polish-patch\\.js/)\n})\n`)

updateRequired('tests/reminder-categories.test.js', [
  ["import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'\n", '', 'remove retired polish import'],
  ["  const raw = read('src/todo-stage5-ai.jsx')\n  const page = patchPreviewReminderPolishSource(raw, path.join(root, 'src', 'todo-stage5-ai.jsx'))\n", "  const page = read('src/todo-stage5-ai.jsx')\n", 'verify restore behavior in raw reminder source'],
])

updateRequired('tests/reminder-summary-indicator.test.js', [
  ["import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'\n", '', 'remove retired polish import'],
  ["function builtReminderPage() {\n  const source = read('src/todo-stage5-ai.jsx')\n  return patchPreviewReminderPolishSource(source, '/workspace/src/todo-stage5-ai.jsx')\n}\n", "function builtReminderPage() {\n  return read('src/todo-stage5-ai.jsx')\n}\n", 'verify summary indicator in raw reminder source'],
])

fs.unlinkSync(patchPath)
