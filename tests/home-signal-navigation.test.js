import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewHomeInfoSource } from '../src/preview-home-info-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home overview cards route to the correct V2 station and sub-section', () => {
  const stationSource = patchPreviewStationNavSource(read('src/main.jsx'), '/workspace/src/main.jsx')
  const patched = patchPreviewHomeInfoSource(stationSource, '/workspace/src/main.jsx')

  assert.match(patched, /target === 'class'[\s\S]*?setClassSection\('timetable'\)[\s\S]*?changeTab\('class'\)/)
  assert.match(patched, /target === 'board'[\s\S]*?setClassSection\('board'\)[\s\S]*?changeTab\('class'\)/)
  assert.match(patched, /target === 'study'[\s\S]*?changeTab\('study'\)/)
  assert.match(patched, /target === 'reminder'[\s\S]*?setScheduleSection\('todo'\)[\s\S]*?changeTab\('schedule'\)/)
  assert.match(patched, /<Home[\s\S]*?onNavigate=\{navigateHomeSignal\}/)
  assert.match(patched, /<PreviewHomeSignals[\s\S]*?onNavigate=\{onNavigate\}/)
})

test('home overview section opts out of the legacy whole-section navigation handler', () => {
  const signals = read('src/preview-home-signals.jsx')

  assert.match(signals, /data-home-nav-ready="true"/)
  assert.match(signals, /role="button"/)
  assert.match(signals, /onClick=\{\(\) => onNavigate\?\.\(signal\.id\)\}/)
  assert.match(signals, /event\.key !== 'Enter' && event\.key !== ' '/)
})
