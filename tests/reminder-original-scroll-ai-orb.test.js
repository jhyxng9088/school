import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('reminder originals prefer one authenticated binary server request with Firestore fallback', () => {
  const sync = read('src/school-sync.js')
  const summary = read('src/reminder-summary.jsx')
  assert.match(sync, /api\/reminder-original/)
  assert.match(sync, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(sync, /await response\.blob\(\)/)
  assert.match(sync, /getReminderOriginalFromFirestore/)
  assert.match(summary, /original\?\.blob instanceof Blob/)
})

test('summary content owns native vertical scrolling from the first expanded open', () => {
  const sheet = read('src/reminder-summary.jsx')
  const css = read('src/reminder-summary.css')
  assert.match(sheet, /className="reminder-summary-drag-zone"[\s\S]*?onPointerDown=\{pointerDown\}/)
  assert.doesNotMatch(sheet, /aria-label=\{`\$\{todo\.title\} 요약`\}\s+onPointerDown=\{pointerDown\}/)
  assert.doesNotMatch(sheet, /onTouchMove=\{scrollTouchMove\}/)
  assert.match(css, /\.reminder-summary-scroll\s*\{[\s\S]*?touch-action:\s*pan-y;/)
  assert.match(css, /\.reminder-summary-drag-zone\s*\{[\s\S]*?touch-action:\s*none;/)
})

test('home and running S-Hub AI share one animated point-sphere identity', () => {
  const main = read('src/main.jsx')
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const orb = read('src/s-hub-ai-orb.jsx')
  assert.match(main, /<SHubAIOrb size=\{23\}/)
  assert.doesNotMatch(main, /home-ai-trigger[\s\S]{0,180}<Icon type="search"/)
  assert.match(sheet, /s-hub-ai-thinking-stage[\s\S]*?<SHubAIOrb size=\{48\} active/)
  assert.match(orb, /POINT_COUNT = 96/)
  assert.match(orb, /THINKING_MOTIONS = \[/)
  assert.match(orb, /chooseThinkingMotion/)
  assert.match(orb, /Math\.random\(\)/)
  assert.match(orb, /state\.wave/)
  assert.match(orb, /state\.twist/)
  assert.match(orb, /requestAnimationFrame/)
})
