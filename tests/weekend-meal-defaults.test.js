import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('weekend home meal preview stays on today', () => {
  const source = read('src/home-meal-preview.jsx')

  assert.match(source, /const weekend = now\.getDay\(\) === 0 \|\| now\.getDay\(\) === 6/)
  assert.match(source, /weekend \? dayStart\(now\) : afterLunch \? addDays\(now, 1\) : dayStart\(now\)/)
  assert.match(source, /const title = weekend \? '오늘 급식' : afterLunch \? '내일 급식' : '오늘 급식'/)
})

test('weekend meal page opens next Monday by default', () => {
  const source = read('src/meal-page.jsx')

  assert.match(source, /const weekend = todayDay === 0 \|\| todayDay === 6/)
  assert.match(source, /const defaultWeekOffset = weekend \? 1 : 0/)
  assert.match(source, /const initialIndex = todayDay >= 1 && todayDay <= 5 \? todayDay - 1 : 0/)
  assert.match(source, /if \(weekend && selectedIndex !== 0\) setSelectedIndex\(0\)/)
})
