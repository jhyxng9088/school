import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchFinalRuntimeOwnerSource } from '../src/final-runtime-owner-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('final runtime ownership removes the polite DOM observer install from main output', () => {
  const source = `import React from 'react'\nimport { installPoliteCopyRuntime } from './polite-copy-runtime.js'\n\ninstallPoliteCopyRuntime()\n\ncreateRoot(root).render(<App />)\n`
  const next = patchFinalRuntimeOwnerSource(source, '/workspace/src/main.jsx')
  assert.doesNotMatch(next, /installPoliteCopyRuntime/)
  assert.match(next, /createRoot\(root\)\.render/)
})

test('final runtime ownership leaves non-main source untouched', () => {
  const source = `installPoliteCopyRuntime()\n`
  assert.equal(patchFinalRuntimeOwnerSource(source, '/workspace/src/todo.jsx'), source)
})

test('polite copy remains a build-time owner for src and public JavaScript', () => {
  const vite = read('vite.config.js')
  assert.match(vite, /function replaceCopy\(source\)/)
  assert.match(vite, /function patchPublicBuildFiles\(directory\)/)
  assert.match(vite, /transform\(code, id\)/)
  assert.match(vite, /closeBundle\(\) \{\n      patchPublicBuildFiles/)
})

test('the final existing owner delegates runtime cleanup without adding another Vite transform', () => {
  const owner = read('src/shared-icon-owner-patch.js')
  const vite = read('vite.config.js')
  assert.match(owner, /patchFinalRuntimeOwnerSource/)
  assert.equal((vite.match(/patchSharedIconOwnerSource\(next, cleanId\)/g) || []).length, 1)
  assert.doesNotMatch(vite, /patchFinalRuntimeOwnerSource\(next, cleanId\)/)
})
