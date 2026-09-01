import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
  assert.ok(matches.length, `missing CSS block: ${selector}`)
  return matches.at(-1)[1]
}

test('study ranking selected pill mirrors the final bottom-nav visible pill layer', () => {
  const source = read('src/preview-study.css')
  const pill = cssBlock(source, '.preview-study-ranking-pill')
  assert.match(pill, /background:\s*var\(--surface-glass\)\s*!important/)
  assert.match(pill, /0 5px 18px rgba\(0, 0, 0, \.10\)/)

  const samsung = cssBlock(source, 'html.school-samsung .preview-study-ranking-pill')
  assert.match(samsung, /background:\s*var\(--surface\)\s*!important/)
})

test('idle study setup no longer reserves the active-session minimum height', () => {
  const source = read('src/preview-study.css')
  const block = cssBlock(source, '.preview-study-control-card:has(.preview-study-action-dock.is-idle) .preview-study-control-content')
  assert.match(block, /min-height:\s*0/)
})

test('custom subject field expands smoothly and respects reduced motion', () => {
  const source = read('src/preview-study.css')
  const field = cssBlock(source, '.preview-study-custom-subject')
  assert.match(field, /max-height:\s*84px/)
  assert.match(field, /overflow:\s*hidden/)
  assert.match(field, /animation:\s*preview-study-custom-subject-in 420ms/)
  assert.match(source, /@keyframes preview-study-custom-subject-in/)
  assert.match(source, /from\s*\{[\s\S]*?max-height:\s*0;[\s\S]*?margin-top:\s*0;/)
  assert.match(source, /\.preview-study-custom-subject,[\s\S]*?animation:\s*none\s*!important/)
})

test('active session makes pause secondary and stop primary', () => {
  const source = read('src/preview-study.css')
  const pause = cssBlock(source, '.preview-study-action-dock.is-active .preview-study-morph-primary')
  const stop = cssBlock(source, '.preview-study-action-dock.is-active .preview-study-morph-stop')

  assert.match(pause, /background:\s*transparent/)
  assert.match(pause, /color:\s*var\(--text\)/)
  assert.match(pause, /box-shadow:\s*inset 0 0 0 1px var\(--border\)/)

  assert.match(stop, /background:\s*var\(--text\)/)
  assert.match(stop, /color:\s*var\(--bg\)/)
  assert.match(stop, /box-shadow:\s*none/)
})
