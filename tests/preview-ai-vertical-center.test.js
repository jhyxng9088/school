import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const aiCss = fs.readFileSync(new URL('../src/s-hub-ai.css', import.meta.url), 'utf8')
const presentationSource = patchPreviewAIStageMotionSource(aiCss, '/workspace/src/s-hub-ai.css')
const backgroundSource = fs.readFileSync(new URL('../src/preview-ai-background-patch.js', import.meta.url), 'utf8')

test('preview AI page keeps the same center above the fixed nav while reserving scroll clearance', () => {
  assert.match(presentationSource, /--s-hub-ai-top-inset:\s*max\(32px, env\(safe-area-inset-top\)\)/)
  assert.match(presentationSource, /--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(presentationSource, /min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(presentationSource, /padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(presentationSource, /\.app-content:has\(> \.s-hub-ai-page\) > \.s-hub-ai-page\s*\{[\s\S]*margin-block:\s*auto/)
})

test('persistent AI host owns the same clearance and grows with long compose content', () => {
  assert.match(backgroundSource, /\.app-content\.tab-ai\s*\{[\s\S]*--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(backgroundSource, /\.app-content\.tab-ai\s*\{[\s\S]*min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(backgroundSource, /\.app-content\.tab-ai\s*\{[\s\S]*padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(backgroundSource, /\.preview-ai-persistent-host\.is-active\s*\{[\s\S]*flex:\s*1 0 auto;[\s\S]*min-height:\s*auto;/)

  const hostBlock = backgroundSource.match(/\.app-content\.tab-ai > \.preview-ai-persistent-host\.is-active\s*\{([^}]*)\}/)?.[1] || ''
  assert.doesNotMatch(hostBlock, /justify-content:\s*center/)
  assert.doesNotMatch(hostBlock, /min-height:\s*0/)
})

test('short viewports fall back to the normal scroll-safe bottom clearance', () => {
  assert.match(backgroundSource, /@media \(max-height: 760px\)/)
  assert.match(backgroundSource, /padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(backgroundSource, /margin-block:\s*0/)
})
