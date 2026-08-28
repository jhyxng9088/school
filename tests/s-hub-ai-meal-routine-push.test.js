import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub AI receives cached NEIS meal data at request time', () => {
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(transport, /school\.stage3\.meals\.v1/)
  assert.match(transport, /function cachedMealContext\(/)
  assert.match(transport, /추가 SCHOOL_DATA - NEIS 급식 캐시/)
  assert.match(transport, /prompt: enrichedPrompt\.slice\(0, 40_000\)/)
})

test('next-class and meal pushes are paused from September 1 KST without removing their routes', () => {
  const sw = read('public/sw.js')
  assert.match(sw, /2026-09-01T00:00:00\+09:00/)
  assert.match(sw, /function routinePushPaused\(/)
  assert.match(sw, /normalizedTag\.includes\('meal'\)/)
  assert.match(sw, /normalizedTag\.includes\('next-class'\)/)
  assert.match(sw, /normalizedTag\.includes\('period-'\)/)
  assert.match(sw, /if \(routinePushPaused\(tag, body\)\)/)
  assert.match(sw, /notificationTarget[\s\S]*?tab=meal/)
  assert.match(sw, /notificationTarget[\s\S]*?tab=home/)
})
