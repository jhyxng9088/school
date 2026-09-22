import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('restricted-web transport falls back through the S-Hub relay without changing canonical APIs', () => {
  const transport = read('src/supabase-http.js')
  assert.match(transport, /school-reminder-backend\.vercel\.app\/api\/supabase-relay/)
  assert.match(transport, /DIRECT_TIMEOUT_MS = 1600/)
  assert.match(transport, /DIRECT_FAILURE_COOLDOWN_MS = 60_000/)
  assert.match(transport, /method === 'GET' \|\| method === 'HEAD'/)
  assert.match(transport, /if \(supabaseDirectTemporarilyBlocked\(\)\)/)
  assert.match(transport, /likelyFilteredResponse/)
})

test('board, study, presence and activity HTTP owners share the restricted-web transport', () => {
  const files = [
    'src/preview-board-client.js',
    'src/preview-study-client.js',
    'src/supabase-presence.js',
    'src/class-activity-supabase.js',
    'src/preview-board-realtime.js',
    'src/preview-study-realtime.js',
  ]
  files.forEach((path) => {
    const source = read(path)
    assert.match(source, /fetchSupabaseFunction/)
    assert.match(source, /\.\/supabase-http\.js/)
  })

  assert.match(read('src/supabase-presence.js'), /safeToRetry: true/)
})

test('relay is narrowly whitelisted and Vercel-configured', () => {
  const relay = read('push-backend-v2/api/supabase-relay.js')
  const vercel = read('push-backend-v2/vercel.json')

  for (const target of [
    'board-realtime',
    'class-activity-mirror',
    'class-board',
    'class-board-all',
    'class-board-sections',
    'class-presence',
    'class-study',
    'push-subscription-mirror',
    'study-events',
  ]) {
    assert.ok(relay.includes(`'${target}'`), `missing relay target ${target}`)
  }

  assert.match(relay, /authorizationHeader/)
  assert.match(relay, /ALLOWED_TARGETS\.has\(target\)/)
  assert.match(relay, /MAX_BODY_BYTES = 8 \* 1024 \* 1024/)
  assert.match(vercel, /api\/supabase-relay\.js/)
})
