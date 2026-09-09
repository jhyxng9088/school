function validReminderDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function validReminderTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

export function reminderExpiryMs(todo, timetable = null) {
  const dueDate = String(todo?.dueDate || '')
  if (!validReminderDate(dueDate)) return Number.POSITIVE_INFINITY

  // Performance assessments stay available throughout the school day and expire
  // at the canonical 23:00 KST boundary. Timetable/period data and AI-generated
  // times must never move this boundary earlier or later.
  const dueTime = todo?.type === 'performance'
    ? '23:00'
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
