import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home live glow follows semantic current-class state without reading visible copy', () => {
  const runtime = read('public/school-home-live.js')
  const css = read('public/school-home-live.css')

  assert.doesNotMatch(runtime, /syncLiveClass/)
  assert.doesNotMatch(runtime, /current-class-label/)
  assert.doesNotMatch(runtime, /진행 중/)
  assert.doesNotMatch(runtime, /characterData: true/)
  assert.match(css, /body:has\(\.period-item\.is-current\) \.current-class-card::after/)
})

test('semantic live glow preserves the existing breathe motion and lunch reorder motion', () => {
  const runtime = read('public/school-home-live.js')
  const css = read('public/school-home-live.css')

  assert.match(css, /animation: current-class-card-breathe 5\.8s ease-in-out infinite/)
  assert.match(css, /@keyframes current-class-card-breathe/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation: none/)

  assert.match(runtime, /duration: 920/)
  assert.match(runtime, /delay: Math\.min\(index \* 42, 168\)/)
  assert.match(runtime, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(runtime, /animation\.id = 'home-lunch-reorder'/)
  assert.match(runtime, /SAMSUNG_INTERNET/)
  assert.match(runtime, /REDUCED_MOTION\.matches/)
})

test('home live lifecycle releases every global listener on pagehide', () => {
  const runtime = read('public/school-home-live.js')

  assert.match(runtime, /window\.removeEventListener\('resize', syncPriority\)/)
  assert.match(runtime, /window\.removeEventListener\('orientationchange', syncPriority\)/)
  assert.match(runtime, /window\.removeEventListener\('focus', syncAfterResume\)/)
  assert.match(runtime, /document\.removeEventListener\('visibilitychange', syncAfterResume\)/)
  assert.match(runtime, /PHONE_PORTRAIT\.removeEventListener\?\.\('change', syncPriority\)/)
})
