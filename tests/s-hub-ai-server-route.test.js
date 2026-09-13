import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub client keeps Firebase Auth while provider credentials stay server-only', () => {
  const transport = read('src/s-hub-ai-transport.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')

  assert.match(transport, /await ensureSignedIn\(\)/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
  assert.doesNotMatch(transport, /OPENROUTER_API_KEY|MISTRAL_API_KEY/)
  assert.doesNotMatch(transport, /X-Firebase-AppCheck/)
  assert.doesNotMatch(transport, /getDirectFirebaseSecurityHeaders/)

  assert.match(endpoint, /adminAuth\(\)\.verifyIdToken\(token\)/)
  assert.doesNotMatch(endpoint, /adminAppCheckToken/)
  assert.doesNotMatch(endpoint, /adminAccessToken/)

  assert.match(service, /process\.env\.OPENROUTER_API_KEY/)
  assert.match(service, /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/)
  assert.match(service, /google\/gemma-4-31b-it:free/)
  assert.match(service, /Authorization: `Bearer \$\{apiKey\}`/)
  assert.doesNotMatch(service, /AIza[0-9A-Za-z_-]+/)
})

test('S-Hub input hints rotate with a soft 2.5 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /\}, 2500\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after unified S-Hub AI repair', () => {
  assert.match(read('public/sw.js'), /const CACHE_NAME = 'school-shell-v160-class-board-stability'/)
})
