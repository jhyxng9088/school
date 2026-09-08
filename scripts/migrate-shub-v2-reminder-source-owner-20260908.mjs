import fs from 'node:fs'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, value) => fs.writeFileSync(path, value)

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`S-Hub V2 reminder migration marker missing: ${label}`)
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

updateRequired('tests/final-runtime-owner.test.js', [
  ["  const preview = read('src/preview-s-hub-v2-patch.js')\n", "  const todo = read('src/todo-stage5-ai.jsx')\n", 'replace retired patch read with raw todo owner'],
  ["  assert.doesNotMatch(preview, /installPoliteCopyRuntime/)\n  assert.doesNotMatch(preview, /polite-copy-runtime\\.js/)\n", "  assert.doesNotMatch(todo, /installPoliteCopyRuntime/)\n  assert.doesNotMatch(todo, /polite-copy-runtime\\.js/)\n  assert.equal(exists('src/preview-s-hub-v2-patch.js'), false)\n", 'keep polite runtime guard on source owner'],
])

updateRequired('tests/polite-copy-audit.test.js', [
  ["import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", '', 'remove retired patch import'],
  ["  source = patchPreviewSHubV2Source(source, `/workspace/${path}`)\n", '', 'start audit from raw source owner'],
])

updateRequired('tests/preview-board.test.js', [
  ["import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", '', 'remove retired patch import'],
  ["  source = patchPreviewSHubV2Source(source, id)\n", '', 'start board chain from raw main owner'],
])

updateRequired('tests/preview-ui-regressions.test.js', [
  ["import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", '', 'remove retired patch import'],
  ["  const source = read('src/main.jsx')\n  const patched = patchPreviewSHubV2Source(source, '/workspace/src/main.jsx')\n  assert.match(patched, /useLayoutEffect\\(\\(\\) => \\{[\\s\\S]*?window\\.scrollTo\\(0, 0\\)[\\s\\S]*?\\}, \\[activeTab\\]\\)/)\n  assert.match(patched, /document\\.scrollingElement/)\n", "  const source = read('src/main.jsx')\n  assert.match(source, /useLayoutEffect\\(\\(\\) => \\{[\\s\\S]*?window\\.scrollTo\\(0, 0\\)[\\s\\S]*?\\}, \\[activeTab\\]\\)/)\n  assert.match(source, /document\\.scrollingElement/)\n", 'verify tab reset in raw main'],
  ["  const main = patchPreviewSHubV2Source(read('src/main.jsx'), '/workspace/src/main.jsx')\n  const todo = patchPreviewSHubV2Source(read('src/todo-stage5-ai.jsx'), '/workspace/src/todo-stage5-ai.jsx')\n", "  const main = read('src/main.jsx')\n  const todo = read('src/todo-stage5-ai.jsx')\n", 'verify polite copy against raw owners'],
  ["  assert.match(config, /patchPreviewSHubV2Source/)\n", "  assert.doesNotMatch(config, /patchPreviewSHubV2Source/)\n", 'lock retired patch out of Vite'],
])

updateRequired('tests/production-recovery-regression.test.js', [
  ["import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", '', 'remove retired patch import'],
  ["  const id = path.join(root, 'src/todo-stage5-ai.jsx')\n  const source = patchPreviewSHubV2Source(read('src/todo-stage5-ai.jsx'), id)\n", "  const source = read('src/todo-stage5-ai.jsx')\n", 'verify pending sync in raw reminder owner'],
])

updateRequired('tests/reminder-categories.test.js', [
  ["import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", '', 'remove retired patch import'],
  ["test('reminder page build patch adds long-press section editing and keeps custom add colors safe', () => {\n  const raw = read('src/todo-stage5-ai.jsx')\n  const page = patchPreviewSHubV2Source(raw, path.join(root, 'src', 'todo-stage5-ai.jsx'))\n", "test('raw reminder page owns long-press section editing and keeps custom add colors safe', () => {\n  const page = read('src/todo-stage5-ai.jsx')\n", 'verify section management in raw page'],
  ["  const raw = read('src/todo-stage5-ai.jsx')\n  const sectionPatched = patchPreviewSHubV2Source(raw, path.join(root, 'src', 'todo-stage5-ai.jsx'))\n  const page = patchPreviewReminderPolishSource(sectionPatched, path.join(root, 'src', 'todo-stage5-ai.jsx'))\n", "  const raw = read('src/todo-stage5-ai.jsx')\n  const page = patchPreviewReminderPolishSource(raw, path.join(root, 'src', 'todo-stage5-ai.jsx'))\n", 'apply only downstream reminder polish'],
])

updateRequired('tests/reminder-summary-indicator.test.js', [
  ["import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", '', 'remove retired patch import'],
  ["  const source = read('src/todo-stage5-ai.jsx')\n  const withSections = patchPreviewSHubV2Source(source, '/workspace/src/todo-stage5-ai.jsx')\n  return patchPreviewReminderPolishSource(withSections, '/workspace/src/todo-stage5-ai.jsx')\n", "  const source = read('src/todo-stage5-ai.jsx')\n  return patchPreviewReminderPolishSource(source, '/workspace/src/todo-stage5-ai.jsx')\n", 'start summary build from raw reminder owner'],
])

updateRequired('tests/s-hub-ai-reminder-summary-import.test.js', [
  ["  assert.match(vite, /patchPreviewSHubV2Source/)\n", "  assert.doesNotMatch(vite, /patchPreviewSHubV2Source/)\n", 'remove obsolete Vite ordering anchor'],
])

fs.unlinkSync(patchPath)
