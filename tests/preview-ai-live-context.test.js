import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from '../src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'
import { patchPreviewAILiveContextSource } from '../src/preview-ai-live-context-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preview AI question path resolves live context before asking the model', () => {
  let sheet = read('src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAIPageSource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAIDensitySource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAIStageMotionSource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAILiveContextSource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')

  assert.match(sheet, /loadContext = null/)
  assert.match(sheet, /async function resolveQuestionContext\(question, signal\)/)
  assert.match(sheet, /const questionContext = await resolveQuestionContext\(question, controller\.signal\)/)
  assert.match(sheet, /askSchoolHub\(\{ question, context: questionContext, now, signal: controller\.signal \}\)/)
  assert.match(sheet, /answerAndAnalyzeSchoolAttachments\(\{ question, files, context: questionContext/)
})

test('preview AI live loader fetches current class study and aggregate board without opening those tabs first', () => {
  const runtime = read('src/preview-ai-live-context.js')
  assert.match(runtime, /loadPreviewStudy\(\{ signal, scope: 'class' \}\)/)
  assert.match(runtime, /loadPreviewBoard\(\{ signal, sectionId: 'all', forceSections: true \}\)/)
  assert.match(runtime, /scope: 'school'/)
  assert.match(runtime, /wantsSchoolStudy\(question\)/)
  assert.match(runtime, /recorded \+ runningTodaySeconds\(active\.segmentStartedAt \|\| active\.startedAt, nowMs\)/)
  assert.match(runtime, /sort\(\(a, b\) => b\.displaySeconds - a\.displaySeconds/)
  assert.match(runtime, /rank: index \+ 1/)
  assert.match(runtime, /prioritizePreviewAIContext\(question, context, live\)/)
})

test('preview AI prioritizes relevant sources before the context size cap can trim later data', () => {
  const runtime = read('src/preview-ai-live-context.js')
  assert.match(runtime, /questionPriorityKeys\(question\)/)
  assert.match(runtime, /스터디\|공부\|학습\|랭킹\|순위/)
  assert.match(runtime, /게시판\|게시글/)
  assert.match(runtime, /급식\|점심\|중식/)
  assert.match(runtime, /시간표\|교시\|수업/)
  assert.match(runtime, /for \(const key of questionPriorityKeys\(question\)\) ordered\[key\] = merged\[key\]/)
})

test('preview AI prompt understands live study ranks, board posts, and unavailable-source semantics', () => {
  const engine = patchPreviewAILiveContextSource(read('src/s-hub-ai-engine.js'), '/virtual/src/s-hub-ai-engine.js')
  assert.match(engine, /study\.class\.students의 rank는 현재 S-Hub 스터디 화면과 같은 오늘 우리반 순위/)
  assert.match(engine, /board\.posts는 현재 학생이 S-Hub 게시판에서 볼 수 있는 같은 반 게시글/)
  assert.match(engine, /liveSources의 값이 unavailable이면 해당 정보가 없는 것으로 단정하지 말고/)
  assert.match(engine, /스터디·게시판처럼 실시간으로 바뀌는 질문은 응답 캐시를 사용하지 않는다/)
})

test('AI reference panel truthfully shows study and board as live sources', () => {
  let sheet = read('src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAIPageSource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAIDensitySource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAIStageMotionSource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  sheet = patchPreviewAILiveContextSource(sheet, '/virtual/src/s-hub-ai-sheet.jsx')
  const css = patchPreviewAILiveContextSource(
    patchPreviewAIStageMotionSource(
      patchPreviewAIDensitySource(read('src/s-hub-ai.css'), '/virtual/src/s-hub-ai.css'),
      '/virtual/src/s-hub-ai.css',
    ),
    '/virtual/src/s-hub-ai.css',
  )

  assert.match(sheet, /<strong>스터디<\/strong><span>실시간 조회<\/span>/)
  assert.match(sheet, /<strong>게시판<\/strong><span>실시간 조회<\/span>/)
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /nth-child\(5\).*animation-delay: 690ms/)
  assert.match(css, /nth-child\(6\).*animation-delay: 730ms/)
})

test('live AI context patch runs after board-all and study UI patches', () => {
  const vite = read('vite.config.js')
  const boardAll = vite.indexOf('next = patchPreviewBoardAllSource(next, cleanId)')
  const study = vite.indexOf('next = patchPreviewStudyUnifiedUISource(next, cleanId)')
  const live = vite.indexOf('next = patchPreviewAILiveContextSource(next, cleanId)')
  assert.ok(boardAll >= 0 && study >= 0 && live > boardAll && live > study)
})
