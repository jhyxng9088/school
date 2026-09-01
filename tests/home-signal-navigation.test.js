import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home overview cards route to the correct V2 station and sub-section', () => {
  const patch = read('src/preview-home-info-patch.js')

  assert.ok(patch.includes("if (target === 'class') {\\n      changeTab('class')"))
  assert.ok(patch.includes("if (target === 'board') {\\n      setClassSection('board')\\n      changeTab('class')"))
  assert.ok(patch.includes("if (target === 'study') {\\n      changeTab('study')"))
  assert.ok(patch.includes("if (target === 'reminder') {\\n      setScheduleSection('todo')\\n      changeTab('schedule')"))
  assert.match(patch, /onNavigate=\{navigateHomeSignal\}/)
  assert.match(patch, /onNavigate=\{onNavigate\}/)
})

test('home overview section opts out of the legacy whole-section navigation handler', () => {
  const signals = read('src/preview-home-signals.jsx')

  assert.match(signals, /data-home-nav-ready="true"/)
  assert.match(signals, /role="button"/)
  assert.match(signals, /onClick=\{\(\) => onNavigate\?\.\(signal\.id\)\}/)
  assert.match(signals, /event\.key !== 'Enter' && event\.key !== ' '/)
})
