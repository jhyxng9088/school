import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/class-roster-ui-v2.js', import.meta.url), 'utf8')

test('class roster observer only watches the React app root', () => {
  assert.match(source, /const appRoot = document\.getElementById\('root'\)/)
  assert.match(source, /if \(appRoot\) observer\.observe\(appRoot, \{ childList: true, subtree: true, characterData: true \}\)/)
  assert.doesNotMatch(source, /document\.getElementById\('root'\) \|\| document\.documentElement/)
  assert.doesNotMatch(source, /observer\.observe\(document\.documentElement/)
})
