import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('S-Hub V2 tab scroll reset is owned by raw main source', () => {
  const main = read('src/main.jsx')
  assert.match(main, /const resetScroll = \(\) => \{/)
  assert.match(main, /window\.scrollTo\(0, 0\)/)
  assert.match(main, /requestAnimationFrame\(resetScroll\)/)
  assert.match(main, /\}, \[activeTab\]\)/)
})

test('S-Hub V2 reminder section management is owned by raw todo source', () => {
  const todo = read('src/todo-stage5-ai.jsx')
  assert.match(todo, /CUSTOM_REMINDER_CATEGORY_COLORS/)
  assert.match(todo, /reminderFilterOptions\(categories\)/)
  assert.match(todo, /saveReminderSectionChange/)
  assert.match(todo, /function beginSectionPress/)
  assert.match(todo, /function submitSectionEdit/)
  assert.match(todo, /function deleteSectionFromAction/)
  assert.notEqual(patchPreviewReminderPolishSource(todo, '/workspace/src/todo-stage5-ai.jsx'), todo)
})

test('retired S-Hub V2 build patch stays out of the production build graph', () => {
  const vite = read('vite.config.js')
  assert.equal(existsSync(new URL('../src/preview-s-hub-v2-patch.js', import.meta.url)), false)
  assert.doesNotMatch(vite, /patchPreviewSHubV2Source/)
  assert.doesNotMatch(vite, /preview-s-hub-v2-patch\.js/)
  assert.match(vite, /patchPreviewReminderPolishSource/)
})
