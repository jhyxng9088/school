import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const text = (path) => readFileSync(resolve(root, path), 'utf8')

test('stability layer never owns or replays navigation', () => {
  const source = text('src/preview-v2-stability.js')
  assert.doesNotMatch(source, /preventDefault\s*\(/)
  assert.doesNotMatch(source, /stopImmediatePropagation\s*\(/)
  assert.doesNotMatch(source, /retryAIPage/)
  assert.doesNotMatch(source, /replayClicks/)
  assert.doesNotMatch(source, /SEGMENT_ROUTE_DELAY/)
  assert.doesNotMatch(source, /preview-v2-transition-chrome/)
  assert.doesNotMatch(source, /\.home-ai-trigger[^\n]*\.click\s*\(/)
})

test('stability layer uses one device-independent spring for nav and grouped selectors', () => {
  const source = text('src/preview-v2-stability.js')
  assert.match(source, /function moveSpringIndicator/)
  assert.match(source, /requestAnimationFrame\(animate\)/)
  assert.match(source, /handleNavPointerDown/)
  assert.match(source, /handleSegmentPointerDown/)
  assert.match(source, /preview-v2-segment-indicator/)
  assert.doesNotMatch(source, /SamsungBrowser/)
  assert.doesNotMatch(source, /iPhone\|iPod\|Android/)
})

test('AI navigation only closes the existing page and lets the core router handle the requested destination', () => {
  const source = text('src/preview-v2-stability.js')
  assert.match(source, /function closeAIOnNavigation/)
  assert.match(source, /button\.dataset\.previewTab === 'ai'/)
  assert.match(source, /close\.click\(\)/)
  assert.doesNotMatch(source, /__shubPreviewV2\?\.openAI/)
  assert.doesNotMatch(source, /routeToPreviewTab/)
})

test('route masking hides transient wrong pages without cloning interface chrome', () => {
  const source = text('src/preview-v2-stability.js')
  const css = text('src/preview-v2-stability.css')
  assert.match(source, /function startRouteMask/)
  assert.match(source, /class-board/)
  assert.match(source, /class-timetable/)
  assert.match(source, /preview-v2-layer\[data-preview-page="study"\]/)
  assert.match(css, /shub-preview-route-mask/)
  assert.doesNotMatch(source, /cloneNode/)
  assert.doesNotMatch(css, /preview-v2-transition-chrome/)
})

test('study ranking and academic motion remain available in the stable layer', () => {
  const source = text('src/preview-v2-stability.js')
  assert.match(source, /우리 반 랭킹/)
  assert.match(source, /전체 랭킹/)
  assert.match(source, /globalTotals/)
  assert.match(source, /animateNumber/)
  assert.match(source, /animateAcademicList/)
  assert.match(source, /academic-focus-card/)
  assert.match(source, /academic-list-item/)
})
