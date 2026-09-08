import { PERIODS, WEEKDAYS } from './timetable.js'

function validReminderDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function validReminderTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

// Shared class timetable only: personal moving-class schedules must not give
// classmates different expiry boundaries. Missing/no-class days use 16:50 KST
// (the canonical final school period), never a time inferred by AI.
function performanceSchoolEnd(dueDate, timetable) {
  const weekday = new Date(`${dueDate}T12:00:00Z`).getUTCDay()
  const day = WEEKDAYS.find((entry) => entry.jsDay === weekday)
  const fallback = PERIODS[PERIODS.length - 1].end
  if (!day) return fallback
  const overrides = timetable?.overrides?.[dueDate] || {}
  const weekly = timetable?.weeklySchedule?.[day.id] || {}
  const lessons = PERIODS.filter((period) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, period.number)
    const subject = hasOverride ? overrides[period.number]
      : period.number <= day.regularPeriodCount ? weekly[period.number] : ''
    return Boolean(String(subject || '').trim())
  })
  return lessons.length ? lessons[lessons.length - 1].end : fallback
}

export function reminderExpiryMs(todo, timetable = null) {
  const dueDate = String(todo?.dueDate || '')
  if (!validReminderDate(dueDate)) return Number.POSITIVE_INFINITY

  const dueTime = todo?.type === 'performance'
    ? performanceSchoolEnd(dueDate, timetable)
    : String(todo?.dueTime || '').trim()
  const expiryTime = validReminderTime(dueTime) ? `${dueTime}:00.000` : '23:59:59.000'
  const expiry = Date.parse(`${dueDate}T${expiryTime}+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}

export function isReminderExpired(todo, nowMs = Date.now(), timetable = null) {
  return reminderExpiryMs(todo, timetable) <= Number(nowMs)
}

// completed means "I finished it" but the shared reminder is still subscribed.
// hidden means "I deleted it for myself" and must suppress rows, dots, and edit pushes.
export function reminderActivityEligibleForStudent(todo, personalState, nowMs = Date.now(), timetable = null) {
  if (personalState?.hidden === true) return false
  return !isReminderExpired(todo, nowMs, timetable)
}
