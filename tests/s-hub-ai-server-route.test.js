
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub client uses Firebase Auth only and server mints App Check', () => {
  const transport = read('src/s-hub-ai-transport.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const admin = read('push-backend-v2/lib/firebase-admin.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')

  assert.match(transport, /await ensureSignedIn\(\)/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
  assert.doesNotMatch(transport, /X-Firebase-AppCheck/)
  assert.doesNotMatch(transport, /getDirectFirebaseSecurityHeaders/)
  assert.match(admin, /getAppCheck\(adminApp\(\)\)\.createToken/)
  assert.match(endpoint, /adminAppCheckToken\(FIREBASE_APP_ID\)/)
  assert.match(endpoint, /adminAccessToken\(\)/)
  assert.doesNotMatch(endpoint, /req\.headers\['x-firebase-appcheck'\]/)
  assert.match(service, /Authorization: `Bearer \$\{accessToken\}`/)
  assert.match(service, /'X-Firebase-AppCheck': appCheckToken/)
})

test('S-Hub input hints rotate with a soft 2.5 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /\}, 2500\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after unified S-Hub AI repair', () => {
  assert.match(read('public/sw.js'), /school-shell-v150/)
})
