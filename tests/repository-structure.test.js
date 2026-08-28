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

test('retired duplicate runtime files stay removed', () => {
  for (const path of [
    'public/reminder-sheet.css',
    'public/reminder-sheet.js',
    'public/school-sheet.css',
    'public/school-sheet.js',
    'public/icon-v117.svg',
    'public/samsung-apple-nav-icons.css',
    'src/firebase-ai-direct.js',
    'src/unread-indicators.js',
  ]) assert.equal(existsSync(resolve(root, path)), false, path)
})
