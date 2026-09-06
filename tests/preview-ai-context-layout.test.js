import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('active AI patches put quick questions and context before the composer and show meals', () => {
  const id = path.join(root, 'src/s-hub-ai-sheet.jsx')
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, id)
  source = patchPreviewAIDensitySource(source, id)
  source = patchPreviewAIStageMotionSource(source, id)

  const quickIndex = source.indexOf('aria-label="빠른 질문"')
  const infoIndex = source.indexOf('aria-label="AI가 참고하는 정보"')
  const contentIndex = source.indexOf('        {content}', infoIndex)

  assert.ok(quickIndex >= 0)
  assert.ok(infoIndex > quickIndex)
  assert.ok(contentIndex > infoIndex)
  assert.match(source, /<strong>급식<\/strong><span>\{context\?\.meals\?\.length \|\| 0\}개 확인 가능<\/span>/)
})

test('active live-context owner keeps meals as first-class school data', () => {
  const runtime = read('src/preview-ai-live-context.js')
  assert.match(runtime, /CONTEXT_DATA_KEYS = \['study', 'board', 'reminders', 'timetable', 'academic', 'meals'\]/)
  assert.match(runtime, /meals: base\.meals \|\| \[\]/)
  assert.match(runtime, /급식\|점심\|중식/)
  assert.match(runtime, /for \(const key of CONTEXT_DATA_KEYS\)/)
})

test('production Vite uses the active live-context owner and not the retired context-layout transform', () => {
  const vite = read('vite.config.js')
  assert.match(vite, /import \{ patchPreviewAILiveContextSource \} from '\.\/src\/preview-ai-live-context-patch\.js'/)
  assert.match(vite, /next = patchPreviewAILiveContextSource\(next, cleanId\)/)
  assert.doesNotMatch(vite, /preview-ai-context-layout-patch/)
  assert.doesNotMatch(vite, /patchPreviewAIContextLayoutSource/)
})

test('retired AI context-layout patch stays removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/preview-ai-context-layout-patch.js')), false)
})
