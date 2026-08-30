import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanText,
  koreaDateKey,
  normalizeCommentInput,
  normalizePostInput,
  normalizeStudySubject,
  safeStudyDurationMs,
  visibleStudySession,
} from '../lib/preview-v2-logic.js'

test('preview board input is bounded and normalized', () => {
  assert.deepEqual(normalizePostInput({ kind: 'question', title: '  수학   질문 ', body: '  풀이가   궁금해요  ' }), {
    kind: 'question',
    title: '수학 질문',
    body: '풀이가 궁금해요',
  })
  assert.equal(normalizeCommentInput('  답변   입니다 '), '답변 입니다')
  assert.throws(() => normalizePostInput({ title: '', body: 'x' }))
  assert.equal(cleanText('a'.repeat(100), 12).length, 12)
})

test('study input and presence are bounded', () => {
  assert.equal(normalizeStudySubject('  수학  '), '수학')
  assert.equal(normalizeStudySubject(''), '공부')
  const now = 2_000_000
  assert.equal(visibleStudySession({ heartbeatAt: now - 74_999 }, now), true)
  assert.equal(visibleStudySession({ heartbeatAt: now - 75_001 }, now), false)
})

test('study duration does not count long stale gaps', () => {
  const start = 1_000_000
  const heartbeat = start + 60_000
  const stop = start + 10 * 60_000
  assert.equal(safeStudyDurationMs(start, stop, heartbeat), 90_000)
  assert.equal(safeStudyDurationMs(start, start - 1, heartbeat), 0)
})

test('Korea date key respects Asia/Seoul calendar day', () => {
  const utc = Date.parse('2026-08-30T15:30:00Z')
  assert.equal(koreaDateKey(utc), '2026-08-31')
})
