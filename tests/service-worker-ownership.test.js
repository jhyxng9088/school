import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('app entry owns service worker update lifecycle while push keeps only a registration fallback', () => {
  const index = read('index.html')
  const main = read('src/main.jsx')
  const pushClient = read('src/push-client.js')

  assert.doesNotMatch(index, /navigator\.serviceWorker\.getRegistration\(/)
  assert.doesNotMatch(index, /registration\?\.update\(\)/)

  assert.match(main, /navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`/)
  assert.match(main, /updateViaCache:\s*'none'/)
  assert.match(main, /window\.setTimeout\(\(\) => \{[\s\S]*registration\.update\(\)\.catch\(\(\) => \{\}\)[\s\S]*\}, 5000\)/)

  assert.match(pushClient, /const existing = await navigator\.serviceWorker\.getRegistration\(\)/)
  assert.match(pushClient, /if \(existing\) return existing[\s\S]*navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`/)
  assert.match(pushClient, /updateViaCache:\s*'none'/)
  assert.doesNotMatch(pushClient, /\.update\(\)/)

  const updateCalls = [index, main, pushClient]
    .reduce((count, source) => count + (source.match(/\.update\(\)/g) || []).length, 0)
  assert.equal(updateCalls, 1)
})
