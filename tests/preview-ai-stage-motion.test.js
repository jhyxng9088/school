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

test('AI page body remounts by working/mode state so each state gets a page transition', () => {
  const source = builtAISheet()
  assert.match(source, /className="s-hub-ai-page-stage" key=\{working \? 'working' : state\.mode\}/)
  assert.ok(source.indexOf('s-hub-ai-page-stage') < source.indexOf('s-hub-ai-page-capabilities'))
  assert.ok(source.indexOf('s-hub-ai-page-extra') < source.lastIndexOf('</div>\n      </section>'))
})

test('AI state motion reuses the same S-Hub content-in animation timing', () => {
  let css = read('src/s-hub-ai.css')
  css = patchPreviewAIPageSource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIDensitySource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIStageMotionSource(css, '/workspace/src/s-hub-ai.css')
  assert.match(css, /\.s-hub-ai-page-stage \{[\s\S]*animation: content-in 980ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both/)
  assert.match(css, /html\.school-mobile-compat \.s-hub-ai-page-stage \{[\s\S]*animation-duration: 760ms/)
  assert.match(css, /\.s-hub-ai-page-stage \.s-hub-ai-answer,[\s\S]*animation: none/)
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
