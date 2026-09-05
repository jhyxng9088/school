import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home live glow follows semantic current-class state without reading visible copy', () => {
  const priority = read('src/home-meal-priority.js')
  const css = read('public/school-home-live.css')

  assert.doesNotMatch(priority, /syncLiveClass/)
  assert.doesNotMatch(priority, /current-class-label/)
  assert.doesNotMatch(priority, /진행 중/)
  assert.doesNotMatch(priority, /MutationObserver/)
  assert.match(css, /body:has\(\.period-item\.is-current\) \.current-class-card::after/)
})

test('semantic live glow preserves the existing breathe motion and lunch reorder motion', () => {
  const priority = read('src/home-meal-priority.js')
  const css = read('public/school-home-live.css')

  assert.match(css, /animation: current-class-card-breathe 5\.8s ease-in-out infinite/)
  assert.match(css, /@keyframes current-class-card-breathe/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation: none/)

  assert.match(priority, /duration: 920/)
  assert.match(priority, /delay: Math\.min\(index \* 42, 168\)/)
  assert.match(priority, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(priority, /animation\.id = 'home-lunch-reorder'/)
  assert.match(priority, /SAMSUNG_INTERNET/)
  assert.match(priority, /REDUCED_MOTION_QUERY/)
})

test('React home live owner cleans only the resources it owns', () => {
  const priority = read('src/home-meal-priority.js')

  assert.match(priority, /phonePortrait\.removeEventListener\?\.\('change', syncMedia\)/)
  assert.match(priority, /window\.clearTimeout\(boundaryTimer\)/)
  assert.match(priority, /window\.cancelAnimationFrame\(animationFrameRef\.current\)/)
  assert.doesNotMatch(priority, /MutationObserver/)
  assert.doesNotMatch(priority, /window\.addEventListener\('resize'/)
  assert.doesNotMatch(priority, /window\.addEventListener\('orientationchange'/)
  assert.doesNotMatch(priority, /window\.addEventListener\('focus'/)
  assert.doesNotMatch(priority, /document\.addEventListener\('visibilitychange'/)
})
