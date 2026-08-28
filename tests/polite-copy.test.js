import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POLITE_COPY_REPLACEMENTS,
  POLITE_SOURCE_FRAGMENTS,
  applyPoliteCopy,
} from '../src/polite-copy-runtime.js'

const preserved = [
  '이번 주에 뭐 제출해야 돼?',
  '다음 시험 언제야?',
  '내일 시간표 뭐야?',
  '이번 주 시간표 바뀐 거 있어?',
  '예: 이건 수행평가 공지야.',
  '예: 마감일과 준비물만 찾아줘.',
  '예: 시간표 변경도 같이 확인해줘.',
]

function sourceWouldRewrite(text) {
  return [...POLITE_COPY_REPLACEMENTS, ...POLITE_SOURCE_FRAGMENTS]
    .some(([from]) => text.includes(from))
}

test('the seven requested S-Hub example prompts keep their informal wording', () => {
  preserved.forEach((text) => {
    assert.equal(applyPoliteCopy(text), text)
    assert.equal(sourceWouldRewrite(text), false)
  })
})

test('audited app copy is normalized to polite Korean', () => {
  assert.equal(applyPoliteCopy('오늘은 정규 수업이 없어.'), '오늘은 정규 수업이 없어요.')
  assert.equal(applyPoliteCopy('S-Hub AI 요청에 실패했어.'), 'S-Hub AI 요청에 실패했어요.')
  assert.equal(applyPoliteCopy('기기 설정에서 S-Hub 알림을 허용해줘.'), '기기 설정에서 S-Hub 알림을 허용해 주세요.')
  assert.equal(applyPoliteCopy('추가함'), '추가했어요')
})
