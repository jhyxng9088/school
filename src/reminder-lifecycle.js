
export function validReminderDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

export function validReminderTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

export function reminderExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!validReminderDate(dueDate)) return Number.POSITIVE_INFINITY

  const dueTime = String(todo?.dueTime || '').trim()
  const expiryTime = validReminderTime(dueTime) ? `${dueTime}:00.000` : '23:59:59.000'
  const expiry = Date.parse(`${dueDate}T${expiryTime}+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}

export function isReminderExpired(todo, nowMs = Date.now()) {
  return reminderExpiryMs(todo) <= Number(nowMs)
}

// completed means "I finished it" but the shared reminder is still subscribed.
// hidden means "I deleted it for myself" and must suppress rows, dots, and edit pushes.
export function reminderActivityEligibleForStudent(todo, personalState, nowMs = Date.now()) {
  if (personalState?.hidden === true) return false
  return !isReminderExpired(todo, nowMs)
}
