import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = process.cwd()
const retired = ['preview-board-original', 'layer.css'].join('-')
const textFile = /\.(?:css|html|js|jsx|json|md|sh|ya?ml)$/

function collectFiles(target) {
  if (!fs.existsSync(target)) return []
  const stat = fs.statSync(target)
  if (stat.isFile()) return textFile.test(target) ? [target] : []
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => (
    collectFiles(path.join(target, entry.name))
  ))
}

test('obsolete board original-layer stylesheet stays retired and unreferenced', () => {
  assert.equal(fs.existsSync(path.join(root, 'src', retired)), false)

  const candidates = [
    ...collectFiles(path.join(root, 'src')),
    ...collectFiles(path.join(root, 'public')),
    ...collectFiles(path.join(root, 'tests')),
    ...collectFiles(path.join(root, 'e2e')),
    ...['index.html', 'vite.config.js', 'vite.e2e.config.js'].map((file) => path.join(root, file)),
  ]

  const references = candidates
    .filter((file) => fs.existsSync(file))
    .filter((file) => fs.readFileSync(file, 'utf8').includes(retired))
    .map((file) => path.relative(root, file))

  assert.deepEqual(references, [])
})
