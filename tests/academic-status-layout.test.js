import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('multi-day academic events show an ongoing status while active', () => {
  const source = read('src/academic-shared.jsx')
  assert.match(source, /function academicStatusLabel\(now, group\)/)
  assert.match(source, /isMultiDay && group\.startRawDate <= today && today <= group\.endRawDate/)
  assert.match(source, /return isOngoing \? '진행 중' : dDayLabel\(now, group\.startDate\)/)
  assert.doesNotMatch(source, /<b>\{dDayLabel\(now, group\.startDate\)\}<\/b>/)
})

test('academic focus title keeps Korean words separate from the status label', () => {
  const css = read('src/academic-shared.css')
  assert.match(css, /\.academic-focus-card > div \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/)
  assert.match(css, /\.academic-focus-card h2 \{[\s\S]*word-break: keep-all;/)
  assert.match(css, /\.academic-focus-card > div > strong \{[\s\S]*white-space: nowrap;/)
})
