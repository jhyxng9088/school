import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const endpoint = fs.readFileSync(new URL('../api/reminder-original.js', import.meta.url), 'utf8')

test('reminder original endpoint streams binary chunks instead of sending one large payload', () => {
  assert.match(endpoint, /RESPONSE_CHUNK_BYTES = 256 \* 1024/)
  assert.match(endpoint, /res\.write\(chunk\)/)
  assert.match(endpoint, /await once\(res, 'drain'\)/)
  assert.match(endpoint, /res\.end\(\)/)
  assert.doesNotMatch(endpoint, /Content-Length/)
  assert.doesNotMatch(endpoint, /\.send\(original\.buffer\)/)
})
