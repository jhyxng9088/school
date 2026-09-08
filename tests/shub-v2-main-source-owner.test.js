import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('S-Hub V2 tab scroll reset is owned by raw main source', () => {
  const main = read('src/main.jsx')
  assert.match(main, /const resetScroll = \(\) => \{/)
  assert.match(main, /window\.scrollTo\(0, 0\)/)
  assert.match(main, /requestAnimationFrame\(resetScroll\)/)
  assert.match(main, /\}, \[activeTab\]\)/)
})

test('S-Hub V2 reminder section and polish behavior are owned by raw todo source', () => {
  const todo = read('src/todo-stage5-ai.jsx')
  assert.match(todo, /CUSTOM_REMINDER_CATEGORY_COLORS/)
  assert.match(todo, /reminderFilterOptions\(categories\)/)
  assert.match(todo, /saveReminderSectionChange/)
  assert.match(todo, /function beginSectionPress/)
  assert.match(todo, /function submitSectionEdit/)
  assert.match(todo, /function deleteSectionFromAction/)
  assert.match(todo, /const hiddenBuiltinSections = useMemo/)
  assert.match(todo, /const categoryRestoreTarget = useMemo/)
  assert.match(todo, /className="reminder-summary-badge"/)
  assert.doesNotMatch(todo, /className="reminder-summary-handle"/)
})

test('retired S-Hub V2 and reminder polish build patches stay out of the production build graph', () => {
  const vite = read('vite.config.js')
  assert.equal(existsSync(new URL('../src/preview-s-hub-v2-patch.js', import.meta.url)), false)
  assert.equal(existsSync(new URL('../src/preview-reminder-polish-patch.js', import.meta.url)), false)
  assert.doesNotMatch(vite, /patchPreviewSHubV2Source/)
  assert.doesNotMatch(vite, /preview-s-hub-v2-patch\.js/)
  assert.doesNotMatch(vite, /patchPreviewReminderPolishSource/)
  assert.doesNotMatch(vite, /preview-reminder-polish-patch\.js/)
})
