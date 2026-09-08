import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

test('main build path never injects the retired polite DOM runtime', () => {
  const main = read('src/main.jsx')
  const todo = read('src/todo-stage5-ai.jsx')
  const polite = read('src/polite-copy-runtime.js')

  assert.doesNotMatch(main, /installPoliteCopyRuntime/)
  assert.doesNotMatch(todo, /installPoliteCopyRuntime/)
  assert.doesNotMatch(todo, /polite-copy-runtime\.js/)
  assert.equal(exists('src/preview-s-hub-v2-patch.js'), false)
  assert.match(main, /import \{ PreviewHomeSignals \} from '\.\/preview-home-signals\.jsx'/)
  assert.match(main, /import \{ HomeNavAction \} from '\.\/home-nav-action\.jsx'/)
  assert.match(main, /import \{ useHomeMealPriority \} from '\.\/home-meal-priority\.js'/)
  assert.doesNotMatch(polite, /installPoliteCopyRuntime/)
  assert.doesNotMatch(polite, /\bMutationObserver\b/)
  assert.match(polite, /export function applyPoliteCopy/)
  assert.equal(exists('src/preview-home-info-patch.js'), false)
})

test('retired runtime cleanup, icon, segment spring, and class style build owners stay out of the patch chain', () => {
  const main = read('src/main.jsx')
  const vite = read('vite.config.js')

  assert.equal(exists('src/final-runtime-owner-patch.js'), false)
  assert.equal(exists('src/shared-icon-owner-patch.js'), false)
  assert.equal(exists('src/shared-segment-spring-owner-patch.js'), false)
  assert.equal(exists('src/preview-class-top-segment-style-patch.js'), false)
  assert.equal(exists('src/preview-ai-density-patch.js'), false)
  assert.equal(exists('src/preview-ai-spacing-polish-patch.js'), false)
  assert.equal(exists('src/preview-ai-context-layout-patch.js'), false)
  assert.equal(exists('src/preview-ai-background-patch.js'), false)
  assert.equal(exists('src/preview-home-info-patch.js'), false)
  assert.match(main, /import \{ SHubIcon \} from '\.\/s-hub-icon\.jsx'/)
  assert.match(main, /return <SHubIcon name=\{type\} size=\{size\} \/>/)
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
  assert.doesNotMatch(vite, /patchPreviewClassTopSegmentStyleSource/)
  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\.js/)
  assert.doesNotMatch(vite, /patchPreviewAIDensitySource/)
  assert.doesNotMatch(vite, /patchPreviewAIBackgroundSource/)
  assert.doesNotMatch(vite, /preview-ai-background-patch\.js/)
  assert.doesNotMatch(vite, /patchPreviewHomeInfoSource/)
  assert.doesNotMatch(vite, /preview-home-info-patch\.js/)
  assert.doesNotMatch(vite, /preview-ai-density-patch\.js/)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\.js/)
  assert.doesNotMatch(vite, /patchFinalRuntimeOwnerSource/)
})

test('polite copy remains a build-time owner for static source and public JavaScript', () => {
  const vite = read('vite.config.js')
  assert.match(vite, /function replaceCopy\(source\)/)
  assert.match(vite, /function patchPublicBuildFiles\(directory\)/)
  assert.match(vite, /transform\(code, id\)/)
  assert.match(vite, /closeBundle\(\) \{\n      patchPublicBuildFiles/)
})
