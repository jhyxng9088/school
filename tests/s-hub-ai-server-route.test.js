import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub structured AI uses the authenticated Vercel route', () => {
  const ai = read('src/s-hub-ai.js')
  const transport = read('src/s-hub-ai-transport.js')
  assert.match(ai, /generateSchoolStructured/)
  assert.doesNotMatch(ai, /generateDirectStructured/)
  assert.match(transport, /school-reminder-backend\.vercel\.app\/api\/s-hub-ai/)
  assert.match(transport, /Authorization: `Bearer \$\{idToken\}`/)
})

test('S-Hub input hints rotate with a soft 1.8 second cadence', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')
  assert.match(sheet, /QUESTION_HINTS/)
  assert.match(sheet, /NOTICE_HINTS/)
  assert.match(sheet, /window\.setInterval\(\(\) => \{/)
  assert.match(sheet, /\}, 1800\)/)
  assert.match(sheet, /placeholder=\{rotatingHint\}/)
  assert.match(css, /textarea\.is-hint-fading::placeholder/)
  assert.match(css, /transition: opacity 220ms/)
})

test('service worker advances after the S-Hub AI route change', () => {
  assert.match(read('public/sw.js'), /school-shell-v143/)
})
