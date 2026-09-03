import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Study ranking input is owned by its React control, not a document pointer interceptor', () => {
  const homeNav = read('public/school-home-nav.js')

  assert.doesNotMatch(homeNav, /deferStudyScopeTouchToClick/)
  assert.doesNotMatch(homeNav, /addEventListener\('pointerdown'/)
  assert.doesNotMatch(homeNav, /removeEventListener\('pointerdown'/)
  assert.match(homeNav, /data-study-scroll-stability/)
})
