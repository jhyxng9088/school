import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('V2 update tour only targets existing users who already completed the original tour', () => {
  const source = read('public/v2-update-notice.js')

  assert.match(source, /const PROFILE_KEY = 'school\.studentProfile\.v1'/)
  assert.match(source, /const FIRST_TOUR_KEY = 'school\.featureTour\.v1'/)
  assert.match(source, /const UPDATE_TOUR_KEY = 'school\.v2UpdateTour\.v1'/)
  assert.match(source, /localStorage\.getItem\(FIRST_TOUR_KEY\) !== 'done'/)
  assert.match(source, /localStorage\.getItem\(UPDATE_TOUR_KEY\) !== 'done'/)
  assert.match(source, /localStorage\.setItem\(UPDATE_TOUR_KEY, 'done'\)/)
})

test('V2 update tour preserves the existing card-news interaction model and polite copy', () => {
  const source = read('public/v2-update-notice.js')
  const index = read('index.html')
  const sw = read('public/sw.js')

  assert.match(source, /first-run-notice-layer feature-tour-layer/)
  assert.match(source, /feature-tour-shell/)
  assert.match(source, /feature-tour-track/)
  assert.match(source, /feature-tour-progress/)
  assert.match(source, /feature-tour-back/)
  assert.match(source, /feature-tour-next/)
  assert.match(source, /S-Hub가 V2로 업데이트되었습니다\./)
  assert.match(source, /확인할 수 있습니다\./)
  assert.doesNotMatch(source, /업데이트됐어|확인해요\.|시작해요\./)

  assert.match(index, /first-run-notice\.js[\s\S]*v2-update-notice\.js/)
  assert.match(index, /v2-update-notice\.css/)
  assert.match(sw, /school-shell-v156/)
  assert.match(sw, /\.\/v2-update-notice\.css/)
  assert.match(sw, /\.\/v2-update-notice\.js/)
})
