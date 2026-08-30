import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const text = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('preview AI is a real page without replacing its existing AI feature logic', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  const css = text('src/preview-v2-hotfix.css')
  const sheet = text('src/unified-sheet.jsx')
  assert.match(hotfix, /\.s-hub-ai-sheet\.unified-school-page/)
  assert.match(hotfix, /preview-v2-ai-page/)
  assert.match(hotfix, /unified-sheet-close/)
  assert.match(sheet, /previewAIPagePresentation/)
  assert.match(sheet, /unified-school-page/)
  assert.match(sheet, /aria-modal="false"/)
  assert.match(css, /unified-school-page\.preview-v2-ai-page/)
  assert.match(css, /height: 100dvh/)
  assert.doesNotMatch(css, /preview-v2-ai-backdrop/)
})

test('preview UX disables duplicate native entrance animation and warms board and study data', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  const css = text('src/preview-v2-hotfix.css')
  assert.match(hotfix, /fetchWarmResource\('board'/)
  assert.match(hotfix, /fetchWarmResource\('study'/)
  assert.match(hotfix, /ensureSignedIn/)
  assert.match(css, /html\.shub-preview-v2 \.app-content/)
  assert.match(css, /html\.shub-preview-v2 \.preview-v2-layer/)
  assert.match(css, /animation: none !important/)
  assert.doesNotMatch(css, /preview-v2-reveal/)
})

test('all preview selectors use the same requestAnimationFrame spring instead of CSS-only sliding', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  const css = text('src/preview-v2-hotfix.css')
  assert.match(hotfix, /function springPaint/)
  assert.match(hotfix, /function moveSpringIndicator/)
  assert.match(hotfix, /moveSpringIndicator\(nav, indicator, selected/)
  assert.match(hotfix, /moveSpringIndicator\(segment, indicator, selected/)
  assert.match(hotfix, /state\.velocity/)
  assert.match(css, /preview-v2-indicator[\s\S]*transition: none !important/)
  assert.match(css, /preview-v2-segment-indicator/)
})
