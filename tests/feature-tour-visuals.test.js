import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function thinkingMotions(source) {
  const block = source.match(/const THINKING_MOTIONS = \[[\s\S]*?\n\s*\]/)?.[0] || ''
  return block
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
}

test('feature tour first card uses the same S-Hub AI thinking motion profiles', () => {
  const component = read('src/s-hub-ai-orb.jsx')
  const runtime = read('public/feature-tour-ai-orb.js')
  const index = read('index.html')
  const sw = read('public/sw.js')

  assert.equal(thinkingMotions(runtime), thinkingMotions(component))
  assert.match(runtime, /const POINT_COUNT = 96/)
  assert.match(runtime, /const GOLDEN_ANGLE = Math\.PI \* \(3 - Math\.sqrt\(5\)\)/)
  assert.match(runtime, /const perspective = 1 \/ \(1 - zX \* 0\.27\)/)
  assert.match(runtime, /const ripple = 1 \+ state\.wave \* Math\.sin\(seconds \* 3\.25 \+ point\.index \* 0\.71 \+ point\.y \* 2\.4\)/)
  assert.match(runtime, /\.feature-tour-ai-orb/)
  assert.match(runtime, /host\.replaceChildren\(\)/)
  assert.match(runtime, /mountThinkingOrb\(canvas, \{ size: hostSize \}\)/)
  assert.match(index, /feature-tour-ai-orb\.js[\s\S]*first-run-notice\.js/)
  assert.match(sw, /school-shell-v154/)
  assert.match(sw, /\.\/feature-tour-ai-orb\.js/)
})

test('feature tour notice card visibly scans the document and marks detected regions', () => {
  const source = read('public/first-run-notice.js')
  const css = read('public/first-run-notice.css')

  assert.match(source, /class="feature-tour-scan"/)
  assert.match(source, /class="feature-tour-scan-document"/)
  assert.match(source, /feature-tour-scan-corner is-tl/)
  assert.match(source, /feature-tour-scan-beam/)
  assert.match(source, /feature-tour-scan-detect is-one/)
  assert.match(source, /feature-tour-scan-detect is-two/)
  assert.match(source, /feature-tour-scan-detect is-three/)

  assert.match(css, /\.feature-tour-slide\.is-active \.feature-tour-scan-beam[\s\S]*feature-tour-scan-sweep/)
  assert.match(css, /@keyframes feature-tour-scan-sweep/)
  assert.match(css, /top: 15px;[\s\S]*top: 157px;/)
  assert.match(css, /@keyframes feature-tour-scan-detect/)
  assert.match(css, /\.feature-tour-slide\.is-active \.feature-tour-scan-corner[\s\S]*feature-tour-scan-corners/)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*feature-tour-scan-beam/)
})

test('feature tour organizer adds four reminders and completes exactly two with the app motion cadence', () => {
  const source = read('public/first-run-notice.js')
  const css = read('public/feature-tour-sequences.css')
  const index = read('index.html')
  const sw = read('public/sw.js')

  assert.equal((source.match(/class="feature-tour-reminder-row/g) || []).length, 4)
  assert.equal((source.match(/feature-tour-reminder-row is-demo-complete/g) || []).length, 2)
  assert.match(source, /--enter-delay: 260ms/)
  assert.match(source, /--enter-delay: 1310ms/)
  assert.match(source, /--check-delay: 2240ms/)
  assert.match(source, /--check-delay: 2860ms/)

  assert.match(css, /feature-tour-reminder-enter 620ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /feature-tour-reminder-check 520ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /feature-tour-reminder-copy-complete 520ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /@keyframes feature-tour-reminder-checkmark/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(index, /feature-tour-sequences\.css/)
  assert.match(sw, /\.\/feature-tour-sequences\.css/)
})
