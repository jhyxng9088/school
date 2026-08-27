import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('direct Firebase AI reuses signed-in school app and attaches security credentials', () => {
  const source = read('src/firebase-ai-direct.js')
  assert.match(source, /DIRECT_APP_NAME = 'school-sync'/)
  assert.match(source, /await ensureSignedIn\(\)/)
  assert.match(source, /await user\.getIdToken\(\)/)
  assert.match(source, /Authorization = `Firebase \$\{idToken\}`/)
  assert.match(source, /X-Firebase-AppCheck/)
  assert.match(source, /headers: await directFirebaseHeaders\(\)/)
})

test('structured S-Hub AI has SDK and authenticated raw paths', () => {
  const source = read('src/firebase-ai-direct.js')
  assert.match(source, /async function runSdkStructuredModel/)
  assert.match(source, /responseSchema,/)
  assert.match(source, /async function runStructuredModel/)
  assert.match(source, /await runStructuredModel\(modelName/)
  assert.doesNotMatch(source, /const value = await runRawStructuredModel\(modelName/)
})

test('service worker cache advances for AI auth repair', () => {
  const sw = read('public/sw.js')
  assert.match(sw, /school-shell-v144/)
})
