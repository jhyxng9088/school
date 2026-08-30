const MAX_POST_TITLE = 70
const MAX_POST_BODY = 1200
const MAX_COMMENT_BODY = 500
const MAX_SUBJECT = 24

export function cleanText(value, maxLength) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

export function normalizePostInput(value = {}) {
  const kind = value.kind === 'question' ? 'question' : 'general'
  const title = cleanText(value.title, MAX_POST_TITLE)
  const body = cleanText(value.body, MAX_POST_BODY)
  if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.')
  return { kind, title, body }
}

export function normalizeCommentInput(value) {
  const body = cleanText(value, MAX_COMMENT_BODY)
  if (!body) throw new Error('댓글 내용을 입력해 주세요.')
  return body
}

export function normalizeStudySubject(value) {
  const subject = cleanText(value, MAX_SUBJECT)
  return subject || '공부'
}

export function koreaDateKey(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function safeStudyDurationMs(startedAt, endedAt, heartbeatAt = endedAt) {
  const start = Number(startedAt || 0)
  const end = Number(endedAt || Date.now())
  const heartbeat = Number(heartbeatAt || end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= start) return 0
  const effectiveEnd = Math.min(end, heartbeat > start ? heartbeat + 30_000 : end)
  return Math.max(0, Math.min(effectiveEnd - start, 12 * 60 * 60 * 1000))
}

export function visibleStudySession(value, nowMs = Date.now()) {
  const heartbeatAt = Number(value?.heartbeatAt || 0)
  return heartbeatAt > 0 && nowMs - heartbeatAt <= 75_000
}
