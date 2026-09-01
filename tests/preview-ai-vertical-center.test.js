import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = fs.readFileSync(new URL('../src/preview-ai-context-layout-patch.js', import.meta.url), 'utf8')

test('preview AI page centers within the viewport above the fixed bottom nav', () => {
  assert.match(source, /min-height:\s*calc\(100dvh - var\(--nav-bottom\) - 64px\)/)
  assert.match(source, /\.app-content:has\(> \.s-hub-ai-page\) > \.s-hub-ai-page\s*\{[\s\S]*margin-block:\s*auto/)
  assert.match(source, /padding-bottom:\s*max\(32px, env\(safe-area-inset-top\)\)/)
})

test('short viewports fall back to the normal scroll-safe bottom clearance', () => {
  assert.match(source, /@media \(max-height: 760px\)/)
  assert.match(source, /padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(source, /margin-block:\s*0/)
})
