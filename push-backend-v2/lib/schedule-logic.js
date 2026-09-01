const KST_OFFSET_MS = 9 * 60 * 60 * 1000
export const IMPORTANT_PREFIX = '\u2063school-important\u2063'
export const WINDOW_MS = 10 * 60 * 1000

function shiftedKstDate(nowMs) {
  return new Date(Number(nowMs) + KST_OFFSET_MS)
}

export function kstParts(nowMs = Date.now()) {
  const date = shiftedKstDate(nowMs)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    weekday: date.getUTCDay(),
  }
}

export function kstDateKey(nowMs = Date.now()) {
  const { year, month, day } = kstParts(nowMs)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addDays(dateKey, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return ''
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function tomorrowDateKey(nowMs = Date.now()) {
  return addDays(kstDateKey(nowMs), 1)
}

export function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

export function dueEpochKst(dateKey, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) || !validTime(time)) return NaN
  return Date.parse(`${dateKey}T${time}:00+09:00`)
}

export function withinDueWindow(nowMs, targetMs, windowMs = WINDOW_MS) {
  const now = Number(nowMs)
  const target = Number(targetMs)
  return Number.isFinite(now)
    && Number.isFinite(target)
    && now >= target
    && now < target + Number(windowMs)
}

export function isReminderHourDue(todo, nowMs = Date.now()) {
  if (!todo || !validTime(todo.dueTime)) return false
  const dueMs = dueEpochKst(todo.dueDate, todo.dueTime)
  if (!Number.isFinite(dueMs)) return false
  return withinDueWindow(nowMs, dueMs - 60 * 60 * 1000)
}

export function isNightPreviewWindow(nowMs = Date.now()) {
  const { hour, minute } = kstParts(nowMs)
  return hour === 23 && minute >= 0 && minute < 10
}

export function activeForStudent(todo, state) {
  if (!todo || typeof todo !== 'object') return false
  if (state?.completed === true) return false
  if (state?.hidden === true) return false
  return true
}

export function isImportantAcademic(event) {
  return Boolean(event && String(event.detail || '').startsWith(IMPORTANT_PREFIX))
}

export function reminderHourBody(title) {
  const clean = String(title || '').trim().slice(0, 80)
  return clean ? `${clean} 했나요?` : '할 일을 확인했나요?'
}

export function reminderTomorrowBody(todos) {
  const list = Array.isArray(todos) ? todos.filter(Boolean) : []
  if (!list.length) return ''
  const first = String(list[0]?.title || '할 일').trim().slice(0, 80) || '할 일'
  if (list.length === 1) return `내일 ${first} 있어요. 확인해 주세요.`
  return `내일 ${first} 외 ${list.length - 1}개의 할 일이 있어요. 확인해 주세요.`
}

export function academicTomorrowBody(events) {
  const list = Array.isArray(events) ? events.filter(Boolean) : []
  if (!list.length) return ''
  const first = String(list[0]?.title || '중요 일정').trim().slice(0, 80) || '중요 일정'
  if (list.length === 1) return `내일 ${first}가 있어요.`
  return `내일 ${first} 외 ${list.length - 1}개의 중요 일정이 있어요.`
}
