function pad2(value) {
  return String(value).padStart(2, '0')
}

export function schoolRawDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

function normalizedDayOffType(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

export function isSchoolClosureDayOffType(value) {
  const normalized = normalizedDayOffType(value)
  if (!normalized || normalized === '해당없음') return false
  return /휴업|공휴|방학|휴교|재량|휴무/.test(normalized)
}

export function isNonInstructionalSchoolLabel(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, '')
  if (!normalized) return false
  return /추석|설날|설연휴|대체공휴|공휴일|재량휴업|휴업일|휴교|개교기념|방학/.test(normalized)
}

export function inferSchoolClosureFromSchedule(schedule = []) {
  const subjects = (Array.isArray(schedule) ? schedule : Object.values(schedule || {}))
    .map((item) => String(item?.subject ?? item ?? '').trim())
    .filter(Boolean)

  const labels = subjects.filter(isNonInstructionalSchoolLabel)
  if (labels.length < 2) return null

  const counts = new Map()
  labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1))
  const [label, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || []
  if (!label || count < 2) return null

  return {
    label,
    dayOffType: '시간표 휴업일',
    inferred: true,
  }
}

export function schoolClosureForDate(date, academicEvents = [], schedule = []) {
  const rawDate = schoolRawDateKey(date)
  if (!rawDate) return null

  const event = (Array.isArray(academicEvents) ? academicEvents : []).find((item) => (
    String(item?.rawDate || '') === rawDate
    && isSchoolClosureDayOffType(item?.dayOffType)
  ))

  if (event) {
    const label = String(event.name || event.dayOffType || '휴업일').trim() || '휴업일'
    return {
      rawDate,
      label,
      dayOffType: String(event.dayOffType || '').trim(),
    }
  }

  const inferred = inferSchoolClosureFromSchedule(schedule)
  return inferred ? { rawDate, ...inferred } : null
}

export function nextOpenSchoolDate(anchor, academicEvents = [], {
  includeAnchor = false,
  maxDays = 21,
  scheduleForDate = null,
} = {}) {
  const date = new Date(anchor)
  date.setHours(12, 0, 0, 0)
  if (!includeAnchor) date.setDate(date.getDate() + 1)

  for (let index = 0; index <= maxDays; index += 1) {
    const day = date.getDay()
    const schedule = typeof scheduleForDate === 'function' ? scheduleForDate(date) : []
    if (day !== 0 && day !== 6 && !schoolClosureForDate(date, academicEvents, schedule)) return date
    date.setDate(date.getDate() + 1)
  }

  return date
}
