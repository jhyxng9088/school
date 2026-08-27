
const IMPORT_INTENT = /(?:추가(?:해\s*줘|해주세요|해줘|해)?|등록(?:해\s*줘|해주세요|해줘|해)?|저장(?:해\s*줘|해주세요|해줘|해)?|반영(?:해\s*줘|해주세요|해줘|해)?|리마인더(?:에|로)|학사일정(?:에|으로|로)|시간표(?:에|로)|일정(?:으로|에)?\s*(?:추가|등록|저장)|(?:일정|항목).{0,8}(?:뽑아|뽑아줘|추출해|추출해줘))/i
const QUESTION_INTENT = /[?？]|(?:알려\s*줘|알려줘|말해\s*줘|말해줘|요약|정리(?:해\s*줘|해줘)?|설명(?:해\s*줘|해줘)?|뭐(?:야|지|가|를|\s*해야)|무엇|언제|어떻게|왜|해야\s*(?:돼|해|할)|할\s*(?:것|일)|오늘\s*(?:할|해야)|내일\s*(?:할|해야)|체크리스트|답해\s*줘|답해줘)/i

export function classifyAttachmentTextIntent(text = '') {
  const value = String(text || '').trim()
  if (!value) return 'import'
  if (IMPORT_INTENT.test(value)) return 'import'
  if (QUESTION_INTENT.test(value)) return 'answer'
  return 'context'
}
