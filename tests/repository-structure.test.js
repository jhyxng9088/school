import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const text = (path) => readFileSync(resolve(root, path), 'utf8')

test('only the permanent deployment workflow remains', () => {
  const workflows = readdirSync(resolve(root, '.github/workflows')).filter((name) => /\.ya?ml$/.test(name)).sort()
  assert.deepEqual(workflows, ['deploy.yml'])
  assert.equal(existsSync(resolve(root, '.github/scripts')), false)
  assert.equal(existsSync(resolve(root, '.github/preview-deploy-trigger.txt')), false)
})

test('bottom navigation uses one five-tab count and mobile touch intent', () => {
  const styles = text('src/styles.css')
  const main = text('src/main.jsx')
  assert.match(styles, /--nav-count:\s*5;/)
  assert.match(styles, /grid-template-columns:\s*repeat\(var\(--nav-count, 5\)/)
  assert.doesNotMatch(styles, /\.bottom-nav[\s\S]{0,700}grid-template-columns:\s*repeat\(4,/)
  assert.match(main, /'--nav-count': tabs\.length/)
  assert.match(main, /onPointerDown=/)
})

test('closing sheets still intercept taps', () => {
  const css = text('src/unified-sheet.css')
  assert.match(css, /\.unified-sheet-backdrop\.is-closing\s*\{[\s\S]*?pointer-events:\s*auto;/)
})

test('native date and time controls remain hit-testable', () => {
  const todo = text('src/todo.css')
  const academic = text('src/academic-shared.css')
  assert.match(todo, /todo-control-shell[\s\S]*?touch-action:\s*manipulation;/)
  assert.match(academic, /academic-date-control > input\[type="date"\][\s\S]*?touch-action:\s*manipulation;/)
})

test('service-worker app shell only references files that exist', () => {
  const sw = text('public/sw.js')
  const match = sw.match(/const APP_SHELL = \[(.*?)\]/s)
  assert.ok(match)
  const paths = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
  for (const path of paths) {
    if (path === './') {
      assert.ok(existsSync(resolve(root, 'index.html')))
      continue
    }
    assert.ok(existsSync(resolve(root, 'public', path.replace(/^\.\//, ''))), `Missing cached file: ${path}`)
  }
})

test('board entry is source-owned without a build redirect shim', () => {
  const entry = text('src/preview-board.jsx')
  const patch = text('src/preview-board-patch.js')
  assert.equal(entry.trim(), "export { PreviewBoard } from './preview-board-complete.jsx'")
  assert.doesNotMatch(patch, /preview-board-complete-patch/)
  assert.doesNotMatch(patch, /preview-board-finish-patch/)
  assert.doesNotMatch(patch, /cleanId\.endsWith\('\/preview-board\.jsx'\)/)
})

test('class roster uses only the v2 runtime owner', () => {
  const main = text('src/main.jsx')
  assert.match(main, /from '\.\/class-roster-ui-v2\.js'/)
  assert.equal(existsSync(resolve(root, 'src/class-roster-ui.js')), false)
})

test('academic UI is owned by the shared academic module', () => {
  const stage3 = text('src/stage3.js')
  const main = text('src/main.jsx')
  assert.doesNotMatch(stage3, /\bAcademicPage\b/)
  assert.doesNotMatch(stage3, /\bAcademicPreview\b/)
  assert.match(main, /SharedAcademicPage, SharedAcademicPreview/)
})

test('retired duplicate runtime files stay removed', () => {
  for (const path of [
    'public/reminder-sheet.css',
    'public/reminder-sheet.js',
    'public/school-sheet.css',
    'public/school-sheet.js',
    'public/icon-v117.svg',
    'public/samsung-apple-nav-icons.css',
    'scripts/v2-cross-device-browser-check.mjs',
    'scripts/verify-preview-isolation.mjs',
    'src/firebase-ai-direct.js',
    'src/unread-indicators.js',
    'src/preview-board-complete-patch.js',
    'src/preview-board-finish-patch.js',
    'src/class-roster-ui.js',
  ]) assert.equal(existsSync(resolve(root, path)), false, path)
})
