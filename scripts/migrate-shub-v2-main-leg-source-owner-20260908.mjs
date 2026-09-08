import fs from 'node:fs'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, value) => fs.writeFileSync(path, value)

const mainPath = 'src/main.jsx'
const patchPath = 'src/preview-s-hub-v2-patch.js'
const main = read(mainPath)
const migratedMain = patchPreviewSHubV2Source(main, '/workspace/src/main.jsx')
if (migratedMain === main) throw new Error('S-Hub V2 main leg migration had no effect')
write(mainPath, migratedMain)

let patchSource = read(patchPath)
const mainStart = patchSource.indexOf('function patchMainSource(source) {')
const todoStart = patchSource.indexOf('function patchTodoStage5Source(source) {')
if (mainStart < 0 || todoStart < 0 || todoStart <= mainStart) {
  throw new Error('S-Hub V2 main leg function boundary missing')
}
patchSource = `${patchSource.slice(0, mainStart)}${patchSource.slice(todoStart)}`
const mainDispatch = "  if (cleanId.endsWith('/main.jsx')) return patchMainSource(String(source || ''))\n"
if (!patchSource.includes(mainDispatch)) throw new Error('S-Hub V2 main dispatch missing')
patchSource = patchSource.replace(mainDispatch, '')
write(patchPath, patchSource)

write('tests/shub-v2-main-source-owner.test.js', `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFileSync } from 'node:fs'\nimport { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n\nconst read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')\n\ntest('S-Hub V2 tab scroll reset is owned by raw main source', () => {\n  const main = read('src/main.jsx')\n  assert.match(main, /const resetScroll = \\(\\) => \\{/)\n  assert.match(main, /window\\.scrollTo\\(0, 0\\)/)\n  assert.match(main, /requestAnimationFrame\\(resetScroll\\)/)\n  assert.match(main, /\\}, \\[activeTab\\]\\)/)\n  assert.equal(patchPreviewSHubV2Source(main, '/workspace/src/main.jsx'), main)\n})\n\ntest('S-Hub V2 build patch still owns the remaining reminder-section leg', () => {\n  const todo = read('src/todo-stage5-ai.jsx')\n  assert.notEqual(patchPreviewSHubV2Source(todo, '/workspace/src/todo-stage5-ai.jsx'), todo)\n  const patchSource = read('src/preview-s-hub-v2-patch.js')\n  assert.doesNotMatch(patchSource, /function patchMainSource/)\n  assert.doesNotMatch(patchSource, /endsWith\\('\/main\\.jsx'\\)/)\n  assert.match(patchSource, /function patchTodoStage5Source/)\n})\n`)
