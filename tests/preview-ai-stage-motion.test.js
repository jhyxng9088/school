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

function builtAICss() {
  let css = read('src/s-hub-ai.css')
  css = patchPreviewAIPageSource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIDensitySource(css, '/workspace/src/s-hub-ai.css')
  css = patchPreviewAIStageMotionSource(css, '/workspace/src/s-hub-ai.css')
  return css
}

test('AI page keeps one persistent stage instead of remounting on every state change', () => {
  const source = builtAISheet()
  assert.match(source, /className=\{'s-hub-ai-page-stage ' \+ \(working \? 'is-working' : 'is-' \+ state\.mode\)\}/)
  assert.doesNotMatch(source, /key=\{working \? 'working' : state\.mode\}/)
  assert.ok(source.indexOf('s-hub-ai-page-stage') < source.indexOf('s-hub-ai-page-capabilities'))
  assert.ok(source.indexOf('s-hub-ai-page-extra') < source.lastIndexOf('</div>\n      </section>'))
})

test('inline working state uses one enlarged hero orb and minimal status copy', () => {
  const source = builtAISheet()
  assert.match(source, /s-hub-ai-page-hero ' \+ \(working \? 'is-working' : 'is-idle'\)/)
  assert.match(source, /<SHubAIOrb size=\{working \? 96 : 42\} active=\{working\} \/>/)
  assert.match(source, /\{!inline \? <SHubAIOrb size=\{56\} active \/> : null\}/)
  assert.match(source, /s-hub-ai-working-sr/)
  assert.match(source, /\{working \? '처리 중' : 'AI'\}/)
  assert.match(source, /\{working \? workingMessage : '학교 정보를 묻고/)
})

test('AI compose entry keeps the existing S-Hub stagger rhythm', () => {
  const css = builtAICss()
  assert.match(css, /@keyframes s-hub-ai-piece-in/)
  assert.match(css, /animation: s-hub-ai-piece-in 720ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both/)
  assert.match(css, /\.s-hub-ai-page-hero \{ animation-delay: 30ms; \}/)
  assert.match(css, /capability:nth-child\(1\) \{ animation-delay: 90ms; \}/)
  assert.match(css, /quick:nth-child\(4\) \{ animation-delay: 410ms; \}/)
  assert.match(css, /context-item:nth-child\(4\) \{ animation-delay: 650ms; \}/)
  assert.match(css, /> \.s-hub-ai-content \{ animation-delay: 710ms; \}/)
})

test('working hero grows smoothly without adding a second visible orb', () => {
  const css = builtAICss()
  assert.match(css, /\.s-hub-ai-page-hero\.is-working[\s\S]*min-height: 142px/)
  assert.match(css, /\.s-hub-ai-page-hero\.is-working \.s-hub-ai-page-mark[\s\S]*width: 108px;[\s\S]*height: 108px/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-working[\s\S]*s-hub-ai-working-flow-in 700ms/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-working \.s-hub-ai-thinking-stage[\s\S]*min-height: 24px !important/)
})

test('answer and import results stream in from top to bottom', () => {
  const css = builtAICss()
  assert.match(css, /@keyframes s-hub-ai-stream-in/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-answer \.s-hub-ai-answer,[\s\S]*animation: s-hub-ai-stream-in 760ms/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-import \.s-hub-ai-result-head \{ animation-delay: 95ms; \}/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-import \.s-hub-ai-item:nth-child\(1\) \{ animation-delay: 145ms; \}/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-import \.s-hub-ai-item:nth-child\(6\) \{ animation-delay: 345ms; \}/)
  assert.match(css, /\.s-hub-ai-page-stage\.is-import \.s-hub-ai-save-result \{ animation-delay: 430ms; \}/)
})

test('mobile and reduced-motion modes keep the transition safe', () => {
  const css = builtAICss()
  assert.match(css, /html\.school-mobile-compat \.s-hub-ai-page-hero\.is-working \.s-hub-ai-page-mark[\s\S]*width: 96px/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important;[\s\S]*transition-duration: 0\.01ms !important;/)
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
