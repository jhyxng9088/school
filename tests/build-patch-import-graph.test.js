import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'

const root = process.cwd()
const srcDir = resolve(root, 'src')

function repoPath(path) {
  return relative(root, path).split(sep).join('/')
}

function patchImports(file) {
  const source = readFileSync(resolve(root, file), 'utf8')
  const imports = []
  const pattern = /(?:\bfrom\s+|\bimport\s*)['"](\.[^'"]+-patch\.js)['"]/g
  for (const match of source.matchAll(pattern)) {
    imports.push(repoPath(resolve(root, dirname(file), match[1])))
  }
  return imports
}

function reachablePatches(entry) {
  const reachable = new Set()
  const visiting = new Set()

  function visit(file, chain) {
    assert.ok(existsSync(resolve(root, file)), `Missing build patch dependency: ${[...chain, file].join(' -> ')}`)
    assert.ok(!visiting.has(file), `Build patch import cycle: ${[...chain, file].join(' -> ')}`)
    if (reachable.has(file)) return

    visiting.add(file)
    reachable.add(file)
    for (const dependency of patchImports(file)) visit(dependency, [...chain, file])
    visiting.delete(file)
  }

  for (const dependency of patchImports(entry)) visit(dependency, [entry])
  return reachable
}

test('every build patch is reachable from a Vite build entry', () => {
  const allPatches = readdirSync(srcDir)
    .filter((name) => name.endsWith('-patch.js'))
    .map((name) => `src/${name}`)
    .sort()

  const productionPatches = reachablePatches('vite.config.js')
  const e2ePatches = reachablePatches('vite.e2e.config.js')
  const reachable = new Set([...productionPatches, ...e2ePatches])
  const orphaned = allPatches.filter((file) => !reachable.has(file))

  assert.deepEqual(orphaned, [], `Orphaned build patch files: ${orphaned.join(', ')}`)
})

test('E2E fixture patch stays outside the production patch graph', () => {
  const productionPatches = reachablePatches('vite.config.js')
  const e2ePatches = reachablePatches('vite.e2e.config.js')

  assert.equal(productionPatches.has('src/e2e-board-fixture-patch.js'), false)
  assert.equal(e2ePatches.has('src/e2e-board-fixture-patch.js'), true)
})
