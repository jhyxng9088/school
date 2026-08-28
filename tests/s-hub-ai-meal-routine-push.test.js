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

test('next-class and meal pushes are paused from September 1 KST without affecting other notification bodies', () => {
  const sw = read('public/sw.js')
  const pauseFunction = sw.match(/function routinePushPaused\([\s\S]*?\n}\n/)?.[0] || ''

  assert.match(sw, /2026-09-01T00:00:00\+09:00/)
  assert.match(pauseFunction, /normalizedTag\.includes\('meal'\)/)
  assert.match(pauseFunction, /normalizedTag\.includes\('next-class'\)/)
  assert.match(pauseFunction, /normalizedTag\.includes\('period-'\)/)
  assert.doesNotMatch(pauseFunction, /normalizedBody|급식|점심시간|다음 시간은/)
  assert.match(sw, /if \(routinePushPaused\(tag\)\)/)

  // Routing for the paused notifications remains intact so they can be re-enabled later.
  assert.match(sw, /notificationTarget[\s\S]*?tab=meal/)
  assert.match(sw, /notificationTarget[\s\S]*?tab=home/)

  // Other notification families must remain routable and outside the pause function.
  assert.match(sw, /normalizedTag\.includes\('reminder'\)[\s\S]*?tab=todo/)
  assert.match(sw, /normalizedTag\.includes\('timetable'\)[\s\S]*?tab=timetable/)
  assert.match(sw, /normalizedTag\.includes\('academic'\)[\s\S]*?tab=academic/)
  assert.doesNotMatch(pauseFunction, /reminder|timetable|academic/)
})
