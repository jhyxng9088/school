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
