import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/supabase-scheduler-state.js', import.meta.url), 'utf8')

test('scheduler Supabase client authenticates with a Firebase Admin-only service uid', () => {
  assert.match(source, /createCustomToken\(SCHEDULER_UID\)/)
  assert.match(source, /const SCHEDULER_UID = 's-hub-scheduler'/)
  assert.match(source, /accounts:signInWithCustomToken/)
  assert.match(source, /authorization: `Bearer \$\{token\}`/)
})

test('scheduler token is cached and Supabase failures stay recoverable', () => {
  assert.match(source, /cachedTokenExpiresAt > Date\.now\(\) \+ 60_000/)
  assert.match(source, /Supabase scheduler runtime unavailable; using Firestore fallback/)
  assert.match(source, /return \{ available: false, runtime: null \}/)
  assert.match(source, /Supabase scheduler runtime write skipped; Firestore shadow remains/)
})
