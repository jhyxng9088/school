import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('app shell owns one deployment refresh guard that compares built module entries', () => {
  const index = read('index.html')
  const refresh = read('src/deployment-refresh.js')

  assert.match(index, /<script type="module" src="\/src\/deployment-refresh\.js"><\/script>/)
  assert.equal((index.match(/\/src\/deployment-refresh\.js/g) || []).length, 1)

  assert.match(refresh, /querySelectorAll\('script\[type="module"\]\[src\]'\)/)
  assert.match(refresh, /new DOMParser\(\)\.parseFromString\(html, 'text\/html'\)/)
  assert.match(refresh, /shellUrl\.searchParams\.set\('__shub_deploy_check'/)
  assert.match(refresh, /cache:\s*'no-store'/)
  assert.match(refresh, /window\.location\.reload\(\)/)
})

test('deployment refresh checks safe lifecycle boundaries instead of polling continuously', () => {
  const refresh = read('src/deployment-refresh.js')

  assert.match(refresh, /window\.addEventListener\('pageshow'/)
  assert.match(refresh, /window\.addEventListener\('online'/)
  assert.match(refresh, /document\.addEventListener\('visibilitychange'/)
  assert.doesNotMatch(refresh, /setInterval\(/)
  assert.match(refresh, /document\.hidden \|\| navigator\.onLine === false/)
  assert.match(refresh, /deploymentReloading = true[\s\S]*window\.location\.reload\(\)/)
})
