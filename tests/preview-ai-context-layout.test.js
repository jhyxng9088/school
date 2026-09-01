import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'
import { patchPreviewAIContextLayoutSource } from '../src/preview-ai-context-layout-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('preview AI puts quick questions and context before the composer and shows meals', () => {
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

test('preview AI context includes normalized meal data from live school state', async () => {
  const id = path.join(root, 'src/s-hub-ai-core.js')
  const source = patchPreviewAIContextLayoutSource(read('src/s-hub-ai-core.js'), id)
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  const core = await import(moduleUrl)

  const context = core.buildSchoolAIContext({
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

test('preview main feeds meal ranges into AI context and transport avoids duplicate meal prompts', () => {
  const main = patchPreviewAIContextLayoutSource(read('src/main.jsx'), path.join(root, 'src/main.jsx'))
  assert.match(main, /mealRanges: schoolData\?\.mealRanges \|\| \{\}/)
  assert.match(main, /schoolData\?\.mealRanges/)

  const transport = patchPreviewAIContextLayoutSource(read('src/s-hub-ai-transport.js'), path.join(root, 'src/s-hub-ai-transport.js'))
  assert.match(transport, /SCHOOL_DATA already carries meals/)
  assert.match(transport, /"meals"\\s\*:/)
})
