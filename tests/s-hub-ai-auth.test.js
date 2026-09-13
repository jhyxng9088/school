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
  assert.doesNotMatch(transport, /MISTRAL_API_KEY/)
})

test('server verifies Firebase identity while Mistral provider auth stays server-side', () => {
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')

  assert.match(endpoint, /adminAuth\(\)\.verifyIdToken\(token\)/)
  assert.doesNotMatch(endpoint, /adminAppCheckToken|adminAccessToken/)
  assert.match(service, /process\.env\.MISTRAL_API_KEY/)
  assert.match(service, /Authorization: `Bearer \$\{apiKey\}`/)
  assert.doesNotMatch(service, /FIREBASE_AI_API_KEY|firebasevertexai\.googleapis\.com/)
})

test('service worker cache advances for unified S-Hub AI UX', () => {
  assert.match(read('public/sw.js'), /const CACHE_NAME = 'school-shell-v160-class-board-stability'/)
})
