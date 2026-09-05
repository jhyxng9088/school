import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { POLITE_COPY_REPLACEMENTS, POLITE_SOURCE_FRAGMENTS } from '../src/polite-copy-runtime.js'
import { PREVIEW_POLITE_COPY_REPLACEMENTS } from '../src/preview-polite-copy-additions.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const USER_VISIBLE_FILES = [
  'src/main.jsx',
  'src/todo-stage5-ai.jsx',
  'src/academic-shared.jsx',
  'src/meal-page.jsx',
  'src/home-meal-preview.jsx',
  'src/reminder-summary.jsx',
  'src/network-guard.jsx',
  'src/class-roster-ui.js',
  'src/push-client.js',
  'src/s-hub-ai-sheet.jsx',
  'src/unread-indicators-v2.js',
  'public/first-run-notice.js',
  'public/feature-tour-ai-orb.js',
  'public/notification-tone-profile.js',
]

const PRESERVED_QUESTION_EXAMPLES = [
  '이번 주에 뭐 제출해야 돼?',
  '다음 시험 언제야?',
  '내일 시간표 뭐야?',
  '이번 주 시간표 바뀐 거 있어?',
  '예: 이건 수행평가 공지야.',
  '예: 마감일과 준비물만 찾아줘.',
  '예: 시간표 변경도 같이 확인해줘.',
]

const BANNED_INFORMAL_ENDINGS = [
  /해줘(?=[.'"`])/,
  /했어(?=[.'"`])/,
  /못했어(?=[.'"`])/,
  /없어(?=[.'"`])/,
  /있어(?=[.'"`])/,
  /돼(?=[.'"`])/,
  /이야(?=[.'"`])/,
  /할게(?=[.'"`])/,
  /골라(?=[.'"`])/,
  /눌러(?=[.'"`])/,
  /열어(?=[.'"`])/,
  /선택해(?=[.'"`])/,
  /설치해(?=[.'"`])/,
  /알려줘(?=[.'"`])/,
  /잡았어(?=[.'"`])/,
  /바꿀 수 있어(?=[.'"`])/,
  /중이야(?=[.'"`])/,
  /물어봐(?=[.'"`])/,
  /확인해(?=[.'"`])/,
  /저장해(?=[.'"`])/,
  /추가해(?=[.'"`])/,
]

function replacePairs(source, pairs) {
  let next = String(source || '')
  for (const [from, to] of pairs) next = next.split(from).join(to)
  return next
}

function previewBuiltSource(path) {
  let source = read(path)
  source = patchPreviewSHubV2Source(source, `/workspace/${path}`)
  if (path === 'src/s-hub-ai-sheet.jsx') {
    source = patchPreviewAIPageSource(source, `/workspace/${path}`)
    source = patchPreviewAIDensitySource(source, `/workspace/${path}`)
  }
  source = replacePairs(source, [
    ...POLITE_COPY_REPLACEMENTS.filter(([from]) => from !== '등록된 급식이 없어'),
    ...PREVIEW_POLITE_COPY_REPLACEMENTS,
    ['같은 학사일정이 이미 있어.', '같은 학사일정이 이미 있어요.'],
    ...POLITE_SOURCE_FRAGMENTS,
  ])
  for (const example of PRESERVED_QUESTION_EXAMPLES) source = source.split(example).join('')
  return source
}

test('preview user-facing copy has no audited informal sentence endings outside question examples', () => {
  const failures = []
  for (const path of USER_VISIBLE_FILES) {
    const built = previewBuiltSource(path)
    for (const pattern of BANNED_INFORMAL_ENDINGS) {
      if (pattern.test(built)) failures.push(`${path}: ${pattern}`)
    }
  }
  assert.deepEqual(failures, [])
})
