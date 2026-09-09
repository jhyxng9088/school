import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  UNIFIED_SCHOOL_AI_POLICY,
  applyUnifiedSchoolAiPolicy,
} from '../src/school-ai-policy.js'

const transportSource = await readFile(new URL('../src/s-hub-ai-transport.js', import.meta.url), 'utf8')
const reminderAiSource = await readFile(new URL('../src/firebase-ai.js', import.meta.url), 'utf8')
const schoolAiSource = await readFile(new URL('../src/s-hub-ai-engine.js', import.meta.url), 'utf8')

test('AI tab and Reminder share one interpretation policy at the common transport boundary', () => {
  assert.match(reminderAiSource, /generateSchoolStructured.*s-hub-ai-transport\.js/)
  assert.match(schoolAiSource, /generateSchoolStructured.*s-hub-ai-transport\.js/)
  assert.match(transportSource, /applyUnifiedSchoolAiPolicy/)
  assert.match(transportSource, /const unifiedPrompt = applyUnifiedSchoolAiPolicy\(safePrompt\)/)
  assert.doesNotMatch(reminderAiSource, /school-ai-policy/)
  assert.doesNotMatch(schoolAiSource, /school-ai-policy/)
})

test('unified policy preserves multi-date meanings instead of selecting the first date blindly', () => {
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /가장 빠른 날짜 하나를 기계적으로 고르지 않는다/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /신청 마감, 발표, 제출, 행사/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /actionable deadline/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /다른 중요한 날짜는 summary/)
})

test('unified policy preserves class and period table relationships without guessing', () => {
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /날짜, 교시, 반\/학년의 교차 관계/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /다른 반의 날짜나 교시를 복사하지 않는다/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /시간표를 이용해 억지 추론하지 않는다/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /dueTime에는 원문에 실제 HH:MM 시각/)
})

test('unified policy locks performance notification and expiry semantics', () => {
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /바로 전날 23:00 KST/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /dueDate 당일 23:00 KST에 만료/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /만료 1시간 전 알림.*대상이 아니다/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /9월 16일 22:00에는 알림을 보내지 않는다/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /9월 16일 23:00 야간 알림은 9월 17일 항목/)
  assert.match(UNIFIED_SCHOOL_AI_POLICY, /notifyAt, expiresAt, schoolEnd/)
})

test('unified policy is prepended as the higher-priority interpretation contract', () => {
  const prompt = applyUnifiedSchoolAiPolicy('화면별 작업 지시')
  assert.ok(prompt.startsWith('[S-Hub 통합 학교생활 AI 공통 정책 — 최우선]'))
  assert.ok(prompt.indexOf('사실의 출처와 추측 금지') < prompt.indexOf('[현재 화면의 작업 지시 및 출력 계약]'))
  assert.ok(prompt.endsWith('화면별 작업 지시'))
})
