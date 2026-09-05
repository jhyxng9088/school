import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const url = (path) => new URL(`../${path}`, import.meta.url)
const read = (path) => readFileSync(url(path), 'utf8')

test('home lunch priority is React-owned without a runtime DOM observer', () => {
  const hook = read('src/home-meal-priority.js')
  const patch = read('src/preview-home-info-patch.js')
  const index = read('index.html')
  const sw = read('public/sw.js')

  assert.equal(existsSync(url('public/school-home-live.js')), false)
  assert.doesNotMatch(index, /school-home-live\.js/)
  assert.doesNotMatch(sw, /school-home-live\.js/)
  assert.doesNotMatch(hook, /MutationObserver/)
  assert.doesNotMatch(hook, /document\.querySelector/)
  assert.doesNotMatch(hook, /window\.addEventListener\('resize'/)
  assert.doesNotMatch(hook, /window\.addEventListener\('orientationchange'/)
  assert.doesNotMatch(hook, /document\.addEventListener\('visibilitychange'/)
  assert.doesNotMatch(hook, /window\.addEventListener\('focus'/)

  assert.match(patch, /HOME_MEAL_PRIORITY_IMPORT/)
  assert.match(patch, /useHomeMealPriority\(now\)/)
  assert.match(patch, /ref=\{homeStackRef\}/)
  assert.match(patch, /mealPriority \? 'is-meal-priority' : ''/)
  assert.match(patch, /data-home-lunch-ready/)
})

test('React lunch owner preserves exact boundaries and the existing FLIP motion', () => {
  const hook = read('src/home-meal-priority.js')
  const css = read('public/school-home-live.css')

  assert.match(hook, /lunchStart\.setHours\(12, 50, 0, 0\)/)
  assert.match(hook, /lunchEnd\.setHours\(14, 0, 0, 0\)/)
  assert.match(hook, /schedulePriorityBoundary/)
  assert.match(hook, /window\.setTimeout/)
  assert.match(hook, /duration: 920/)
  assert.match(hook, /delay: Math\.min\(index \* 42, 168\)/)
  assert.match(hook, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(hook, /animation\.id = 'home-lunch-reorder'/)
  assert.match(hook, /prefers-reduced-motion: reduce/)
  assert.match(hook, /SamsungBrowser/)

  assert.match(css, /\.home-stack\.is-meal-priority > \.current-class-card/)
  assert.match(css, /\.home-stack\.is-meal-priority > \.meal-preview/)
  assert.doesNotMatch(css, /\.home-stack\.is-meal-priority > :nth-child\(5\)/)
})
