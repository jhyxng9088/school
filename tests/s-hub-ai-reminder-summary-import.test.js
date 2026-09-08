import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainPath = path.join(root, 'src', 'main.jsx')
const vitePath = path.join(root, 'vite.config.js')

function sourceOwnedMain() {
  return fs.readFileSync(mainPath, 'utf8')
}

test('S-Hub AI 사진 리마인더는 기존 첨부 요약 파이프라인을 재사용한다', () => {
  const source = sourceOwnedMain()
  assert.match(source, /import \{ parseReminderWithAI \} from '\.\/firebase-ai\.js'/)
  assert.match(source, /createPendingReminderSummary\(sourceClaim\.files\)/)
  assert.match(source, /parseReminderWithAI\(targetHint, new Date\(\), files\)/)
  assert.match(source, /todoData\.enrichTodo\(savedId/)
  assert.match(source, /todoData\.uploadOriginalAttachment\(savedId, file, 'a' \+ index\)/)
  assert.match(source, /withAttachmentManifest\(parsed\.summary, files\)/)
  assert.match(source, /void enrichImportedAIReminder\(savedId, item, sourceClaim\)/)
})

test('AI 요약은 선택된 리마인더 제목·분류·마감으로 첨부 범위를 좁힌다', () => {
  const source = sourceOwnedMain()
  assert.match(source, /S-Hub AI가 선택한 리마인더:/)
  assert.match(source, /분류:/)
  assert.match(source, /마감:/)
  assert.match(source, /위 리마인더와 직접 관련된 내용만 골라 요약해 주세요/)
})

test('AI 요약 생성 실패 시에도 무한 요약중 상태로 남기지 않는다', () => {
  const source = sourceOwnedMain()
  assert.match(source, /attempt < 2/)
  assert.match(source, /자동 요약을 완료하지 못했습니다/)
  assert.match(source, /completeSchoolAIReminderSource/)
  assert.match(source, /releaseSchoolAIReminderSource/)
})

test('AI 요약은 raw source가 소유하고 Vite는 퇴역 patch를 다시 적용하지 않는다', () => {
  const vite = fs.readFileSync(vitePath, 'utf8')
  const source = sourceOwnedMain()
  assert.match(vite, /patchPreviewSHubV2Source/)
  assert.doesNotMatch(vite, /patchPreviewAIReminderSummarySource/)
  assert.match(source, /enrichImportedAIReminder/)
  assert.equal(fs.existsSync(path.join(root, 'src', 'preview-ai-reminder-summary-patch.js')), false)
})
