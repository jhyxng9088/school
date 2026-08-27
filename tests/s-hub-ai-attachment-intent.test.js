
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { classifyAttachmentTextIntent } from '../src/s-hub-ai-intent.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('attachment text intent distinguishes questions from import instructions and context', () => {
  assert.equal(classifyAttachmentTextIntent('오늘 할 것을 알려줘'), 'answer')
  assert.equal(classifyAttachmentTextIntent('이 사진 요약해줘'), 'answer')
  assert.equal(classifyAttachmentTextIntent('이거 언제까지 해야 돼?'), 'answer')
  assert.equal(classifyAttachmentTextIntent('이 일정 리마인더에 추가해줘'), 'import')
  assert.equal(classifyAttachmentTextIntent('공지에서 일정 뽑아줘'), 'import')
  assert.equal(classifyAttachmentTextIntent('이건 수행평가 공지야'), 'context')
  assert.equal(classifyAttachmentTextIntent(''), 'import')
})

test('S-Hub has a multimodal answer route that combines attachments with internal school data', () => {
  const ai = read('src/s-hub-ai.js')
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(ai, /export async function askSchoolHubWithAttachments/)
  assert.match(ai, /첨부된 사진, 캡처, PDF, 텍스트 파일과 아래 SCHOOL_DATA를 함께 읽어서/)
  assert.match(ai, /오늘 제출·수행·준비·시험·해야 할 일/)
  assert.match(ai, /attachments,/)
  assert.match(sheet, /classifyAttachmentTextIntent\(input\) === 'answer'/)
  assert.match(sheet, /void askAttachmentQuestion\(\)/)
  assert.match(sheet, /askSchoolHubWithAttachments\(\{ question, files, context, now, signal: controller\.signal \}\)/)
})

test('attachment primary action communicates whether the current request is a question or import', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /const primaryActionLabel = files\.length && attachmentIntent !== 'answer' \? '공지 분석' : '질문하기'/)
  assert.match(sheet, /imageQuestion: \['사진과 질문을 함께 확인하는 중…'/)
  assert.match(sheet, /\{working \? '확인 중…' : primaryActionLabel\}/)
})
