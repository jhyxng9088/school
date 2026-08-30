import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('preview build isolates Firebase auth and Firestore identity paths', () => {
  assert.match(source, /school-sync-preview/)
  assert.match(source, /preview-class-\$\{normalized\.classNumber\}/)
  assert.match(source, /preview\|\$\{normalized\.classNumber\}\|\$\{normalized\.studentNumber\}\|\$\{compactName\}/)
  assert.match(source, /school\.preview\./)
})

test('preview service worker cache cannot delete production cache entries', () => {
  assert.match(source, /school-preview-shell-/)
  assert.match(source, /school-preview-notification-profile-/)
  assert.match(source, /key\.startsWith\('school-preview-'\)/)
})

test('preview isolation stays build-only instead of rewriting production source files', () => {
  const sync = readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')
  assert.match(sync, /initializeApp\(firebaseConfig, 'school-sync'\)/)
  assert.match(sync, /return normalized \? `class-\$\{normalized\.classNumber\}` : ''/)
  assert.match(sync, /return `\$\{normalized\.classNumber\}\|\$\{normalized\.studentNumber\}\|\$\{compactName\}`/)
  assert.match(sync, /school\.studentProfile\.v1/)
  assert.doesNotMatch(sync, /preview-class-/)
})
