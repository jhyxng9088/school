import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/preview-ai-context-layout-patch.js', import.meta.url), 'utf8')

test('preview AI page keeps the same center above the fixed nav while reserving scroll clearance', () => {
  assert.match(source, /--s-hub-ai-top-inset:\s*max\(32px, env\(safe-area-inset-top\)\)/)
  assert.match(source, /--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(source, /min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(source, /padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(source, /\.app-content:has\(> \.s-hub-ai-page\) > \.s-hub-ai-page\s*\{[\s\S]*margin-block:\s*auto/)
})

test('short viewports fall back to the normal scroll-safe bottom clearance', () => {
  assert.match(source, /@media \(max-height: 760px\)/)
  assert.match(source, /padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(source, /margin-block:\s*0/)
})
