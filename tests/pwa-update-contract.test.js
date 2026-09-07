import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('service worker keeps app shell network-first and bypasses stale HTTP cache for shell code', () => {
  const sw = read('../public/sw.js')

  assert.match(sw, /self\.addEventListener\('fetch'/)
  assert.match(sw, /request\.method !== 'GET'/)
  assert.match(sw, /url\.origin !== self\.location\.origin/)
  assert.match(sw, /request\.mode === 'navigate'/)
  assert.match(sw, /request\.destination === 'script'/)
  assert.match(sw, /request\.destination === 'style'/)
  assert.match(sw, /fetch\(request, shouldBypassHttpCache \? \{ cache: 'no-store' \} : undefined\)/)
  assert.match(sw, /if \(response\.ok\) cache\.put\(request, response\.clone\(\)\)/)
  assert.match(sw, /const cached = await cache\.match\(request\)/)
  assert.match(sw, /if \(request\.mode === 'navigate'\) return cache\.match\('\.\/'\)/)
})

test('service worker activates new shell immediately and retires obsolete caches', () => {
  const sw = read('../public/sw.js')

  assert.match(sw, /cache\.addAll\(APP_SHELL\)/)
  assert.match(sw, /self\.skipWaiting\(\)/)
  assert.match(sw, /caches\.keys\(\)/)
  assert.match(sw, /caches\.delete\(key\)/)
  assert.match(sw, /self\.clients\.claim\(\)/)
  assert.match(sw, /event\.data\?\.type === 'SKIP_WAITING'/)
})

test('service worker registration bypasses browser cache for worker updates', () => {
  const client = read('../src/push-client.js')

  assert.match(client, /navigator\.serviceWorker\.getRegistration\(\)/)
  assert.match(client, /navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`/)
  assert.match(client, /updateViaCache: 'none'/)
})

test('service worker lifecycle keeps one primary owner and one guarded push fallback', () => {
  const index = read('../index.html')
  const main = read('../src/main.jsx')
  const client = read('../src/push-client.js')

  assert.doesNotMatch(index, /navigator\.serviceWorker\.register\(/)
  assert.match(main, /window\.addEventListener\('load',[\s\S]*navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`/)
  assert.match(main, /registration\.update\(\)\.catch\(\(\) => \{\}\)/)
  assert.match(client, /const existing = await navigator\.serviceWorker\.getRegistration\(\)[\s\S]*if \(existing\) return existing[\s\S]*navigator\.serviceWorker\.register\(/)
  assert.doesNotMatch(client, /\.update\(\)/)

  const directRegisterCalls = [index, main, client]
    .reduce((count, source) => count + (source.match(/navigator\.serviceWorker\.register\(/g) || []).length, 0)
  assert.equal(directRegisterCalls, 2)
})

test('deployment refresh checks the newest HTML without cache and reloads only when module entries changed', () => {
  const refresh = read('../src/deployment-refresh.js')

  assert.match(refresh, /shellUrl\.searchParams\.set\('__shub_deploy_check'/)
  assert.match(refresh, /cache: 'no-store'/)
  assert.match(refresh, /headers: \{ 'cache-control': 'no-cache' \}/)
  assert.match(refresh, /sameEntries\(currentEntries, latestEntries\)/)
  assert.match(refresh, /window\.location\.reload\(\)/)
  assert.match(refresh, /window\.addEventListener\('pageshow'/)
  assert.match(refresh, /window\.addEventListener\('online'/)
  assert.match(refresh, /document\.addEventListener\('visibilitychange'/)
})
