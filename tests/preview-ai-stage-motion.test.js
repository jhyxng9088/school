import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function builtAISheet() {
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIDensitySource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIStageMotionSource(source, '/workspace/src/s-hub-ai-sheet.jsx')
  return source
}

test('AI page body remounts by working/mode state and marks compose separately', () => {
  const source = builtAISheet()
  assert.match(source, /className=\{'s-hub-ai-page-stage ' \+ \(working \? 'is-working' : 'is-' \+ state\.mode\)\} key=\{working \? 'working' : state\.mode\}/)
  assert.ok(source.indexOf('s-hub-ai-page-stage') < source.indexOf('s-hub-ai-page-capabilities'))
  assert.ok(source.indexOf('s-hub-ai-page-extra') < source.lastIndexOf('</div>\n      </section>'))
})

test('AI compose entry cascades through visible blocks instead of moving as one stage', () => {
  let css = read('src/s-hub-ai.css')
  css = patchPreviewAIPageSource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIDensitySource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIStageMotionSource(css, '/workspace/src/s-hub-ai.css')

  assert.doesNotMatch(css, /\.s-hub-ai-page-stage \{[\s\S]{0,120}animation: content-in/)
  assert.match(css, /\.s-hub-ai-page-stage:not\(\.is-compose\) \{[\s\S]*animation: content-in 980ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both/)
  assert.match(css, /@keyframes s-hub-ai-piece-in/)
  assert.match(css, /\.s-hub-ai-page-hero \{ animation-delay: 35ms; \}/)
  assert.match(css, /capability:nth-child\(1\) \{ animation-delay: 115ms; \}/)
  assert.match(css, /capability:nth-child\(2\) \{ animation-delay: 170ms; \}/)
  assert.match(css, /capability:nth-child\(3\) \{ animation-delay: 225ms; \}/)
  assert.match(css, /section:nth-child\(1\) > \.s-hub-ai-page-extra-head \{ animation-delay: 305ms; \}/)
  assert.match(css, /quick:nth-child\(1\) \{ animation-delay: 385ms; \}/)
  assert.match(css, /quick:nth-child\(4\) \{ animation-delay: 550ms; \}/)
  assert.match(css, /section:nth-child\(2\) > \.s-hub-ai-page-extra-head \{ animation-delay: 630ms; \}/)
  assert.match(css, /context-item:nth-child\(1\) \{ animation-delay: 710ms; \}/)
  assert.match(css, /context-item:nth-child\(4\) \{ animation-delay: 875ms; \}/)
  assert.match(css, /> \.s-hub-ai-content \{ animation-delay: 955ms; \}/)
})

test('AI working and result states keep the existing calm state transition', () => {
  let css = read('src/s-hub-ai.css')
  css = patchPreviewAIPageSource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIDensitySource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIStageMotionSource(css, '/workspace/src/s-hub-ai.css')
  assert.match(css, /html\.school-mobile-compat \.s-hub-ai-page-stage:not\(\.is-compose\) \{[\s\S]*animation-duration: 760ms/)
  assert.match(css, /\.s-hub-ai-page-stage \.s-hub-ai-answer,[\s\S]*animation: none/)
})

test('reduced motion removes both duration and cascade delay', () => {
  let css = read('src/s-hub-ai.css')
  css = patchPreviewAIPageSource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIDensitySource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIStageMotionSource(css, '/workspace/src/s-hub-ai.css')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important;[\s\S]*animation-delay: 0ms !important;/)
})

test('vite applies state motion after AI page and density layers', () => {
  const vite = read('vite.config.js')
  const page = vite.indexOf('patchPreviewAIPageSource(next, cleanId)')
  const density = vite.indexOf('patchPreviewAIDensitySource(next, cleanId)')
  const motion = vite.indexOf('patchPreviewAIStageMotionSource(next, cleanId)')
  assert.ok(page >= 0)
  assert.ok(density > page)
  assert.ok(motion > density)
})
