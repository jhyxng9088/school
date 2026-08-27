
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub no longer depends on iOS reCAPTCHA App Check attestation', () => {
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(transport, /ensureSignedIn/)
  assert.match(transport, /getIdToken/)
  assert.doesNotMatch(transport, /firebase-ai-direct/)
  assert.doesNotMatch(transport, /AppCheck|App Check|X-Firebase-AppCheck/)
})

test('server uses Firebase Admin to mint App Check for Firebase AI', () => {
  const admin = read('push-backend-v2/lib/firebase-admin.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  assert.match(admin, /firebase-admin\/app-check/)
  assert.match(admin, /createToken\(safeAppId/)
  assert.match(endpoint, /adminAppCheckToken/)
})

test('service worker cache advances for unified S-Hub AI UX', () => {
  assert.match(read('public/sw.js'), /school-shell-v150/)
})
