import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('S-Hub V2 tab scroll reset is owned by raw main source', () => {
  const main = read('src/main.jsx')
  assert.match(main, /const resetScroll = \(\) => \{/)
  assert.match(main, /window\.scrollTo\(0, 0\)/)
  assert.match(main, /requestAnimationFrame\(resetScroll\)/)
  assert.match(main, /\}, \[activeTab\]\)/)
  assert.equal(patchPreviewSHubV2Source(main, '/workspace/src/main.jsx'), main)
})

test('S-Hub V2 build patch still owns the remaining reminder-section leg', () => {
  const todo = read('src/todo-stage5-ai.jsx')
  assert.notEqual(patchPreviewSHubV2Source(todo, '/workspace/src/todo-stage5-ai.jsx'), todo)
  const patchSource = read('src/preview-s-hub-v2-patch.js')
  assert.doesNotMatch(patchSource, /function patchMainSource/)
  assert.equal(patchSource.includes("endsWith('/main.jsx')"), false)
  assert.match(patchSource, /function patchTodoStage5Source/)
})
