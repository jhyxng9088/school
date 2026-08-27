import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub structured AI proxies the proven Firebase Auth and App Check credentials', () => {
  const ai = read('src/s-hub-ai.js')
  const transport = read('src/s-hub-ai-transport.js')
  const direct = read('src/firebase-ai-direct.js')
  const endpoint = read('push-backend-v2/api/s-hub-ai.js')
  const service = read('push-backend-v2/lib/s-hub-ai-service.js')

  assert.match(ai, /generateSchoolStructured/)
  assert.doesNotMatch(ai, /generateDirectStructured/)
  assert.match(transport, /school-reminder-backend\.vercel\.app\/api\/s-hub-ai/)
  assert.match(transport, /getDirectFirebaseSecurityHeaders/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(transport, /'X-Firebase-AppCheck': appCheckToken/)
  assert.match(direct, /export async function getDirectFirebaseSecurityHeaders/)
  assert.match(endpoint, /x-firebase-appcheck/)
  assert.match(endpoint, /firebaseIdToken: token/)
  assert.match(service, /Authorization: `Firebase \$\{firebaseIdToken\}`/)
  assert.match(service, /'X-Firebase-AppCheck': appCheckToken/)
  assert.match(service, /'x-goog-api-key': FIREBASE_AI_API_KEY/)
})

test('S-Hub input hints rotate with a soft 2.5 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /QUESTION_HINTS/)
  assert.match(sheet, /NOTICE_HINTS/)
  assert.match(sheet, /window\.setInterval\(\(\) => \{/)
  assert.match(sheet, /\}, 2500\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /textarea\.is-hint-fading::placeholder/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after the App Check proxy repair', () => {
  assert.match(read('public/sw.js'), /school-shell-v144/)
})
