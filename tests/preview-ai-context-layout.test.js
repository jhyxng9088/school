import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildSchoolAIContext } from '../src/s-hub-ai-core.js'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

test('AI presentation owner puts quick questions and context before the composer and shows meals', () => {
  const id = path.join(root, 'src/s-hub-ai-sheet.jsx')
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, id)
  source = patchPreviewAIStageMotionSource(source, id)

  const quickIndex = source.indexOf('aria-label="빠른 질문"')
  const infoIndex = source.indexOf('aria-label="AI가 참고하는 정보"')
  const contentIndex = source.indexOf('        {content}', infoIndex)

  assert.ok(quickIndex >= 0)
  assert.ok(infoIndex > quickIndex)
  assert.ok(contentIndex > infoIndex)
  assert.match(source, /<strong>급식<\/strong><span>\{context\?\.meals\?\.length \|\| 0\}개 확인 가능<\/span>/)
})

test('AI core directly includes normalized meal data from live school state', () => {
  const context = buildSchoolAIContext({
    now: new Date(2026, 8, 1, 9, 30),
    mealRanges: {
      current: {
        meals: [
          { rawDate: '20260901', mealCode: '2', mealName: '중식', dishes: ['쌀밥', '미역국'], calories: '650 Kcal' },
        ],
      },
      duplicate: {
        meals: [
          { rawDate: '20260901', mealCode: '2', mealName: '중식', dishes: ['쌀밥', '미역국'], calories: '650 Kcal' },
          { rawDate: '20260902', mealCode: '2', mealName: '중식', dishes: ['비빔밥'] },
        ],
      },
    },
  })

  assert.deepEqual(context.meals, [
    { date: '2026-09-01', mealCode: '2', mealName: '중식', dishes: ['쌀밥', '미역국'], calories: '650 Kcal' },
    { date: '2026-09-02', mealCode: '2', mealName: '중식', dishes: ['비빔밥'], calories: '' },
  ])
})

test('main and transport directly own meal context wiring and duplicate-prompt avoidance', () => {
  const main = read('src/main.jsx')
  assert.match(main, /mealRanges: schoolData\?\.mealRanges \|\| \{\}/)
  assert.match(main, /schoolData\?\.mealRanges/)

  const transport = read('src/s-hub-ai-transport.js')
  assert.match(transport, /SCHOOL_DATA already carries meals/)
  assert.ok(transport.includes(String.raw`/"meals"\s*:/.test(prompt)`))
})

test('AI presentation owner keeps long composer content above the fixed bottom nav', () => {
  const id = path.join(root, 'src/s-hub-ai.css')
  let css = patchPreviewAIPageSource(read('src/s-hub-ai.css'), id)
  css = patchPreviewAIStageMotionSource(css, id)

  assert.match(css, /--s-hub-ai-top-inset:\s*max\(32px, env\(safe-area-inset-top\)\)/)
  assert.match(css, /--s-hub-ai-nav-clearance:\s*calc\(64px \+ var\(--nav-bottom\) \+ 24px\)/)
  assert.match(css, /min-height:\s*calc\(100dvh \+ 24px - var\(--s-hub-ai-top-inset\)\)/)
  assert.match(css, /padding-bottom:\s*var\(--s-hub-ai-nav-clearance\)/)
  assert.match(css, /\.s-hub-ai-page \.s-hub-ai-content\s*\{[^}]*scroll-margin-bottom:\s*var\(--s-hub-ai-nav-clearance\)/s)
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom\)\)/)
})

test('nested AI context layout build owner is retired', () => {
  const stage = read('src/preview-ai-stage-motion-patch.js')
  assert.equal(exists('src/preview-ai-context-layout-patch.js'), false)
  assert.doesNotMatch(stage, /patchPreviewAIContextLayoutSource/)
  assert.doesNotMatch(stage, /preview-ai-context-layout-patch\.js/)
  assert.match(stage, /function patchAIContextLayoutSheet\(source\)/)
})
