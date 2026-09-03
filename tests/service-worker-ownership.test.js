import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('React owns service worker registration and scheduled update without an index.html duplicate', () => {
  const index = read('index.html')
  const main = read('src/main.jsx')

  assert.doesNotMatch(index, /navigator\.serviceWorker\.getRegistration\(/)
  assert.doesNotMatch(index, /registration\?\.update\(\)/)
  assert.match(main, /navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`/)
  assert.match(main, /updateViaCache:\s*'none'/)
  assert.match(main, /window\.setTimeout\(\(\) => \{[\s\S]*registration\.update\(\)\.catch\(\(\) => \{\}\)[\s\S]*\}, 5000\)/)

  const updateCalls = (index.match(/\.update\(\)/g) || []).length + (main.match(/\.update\(\)/g) || []).length
  assert.equal(updateCalls, 1)
})
