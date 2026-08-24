export const PERIODS = [
  { number: 1, start: '09:10', end: '10:00' },
  { number: 2, start: '10:10', end: '11:00' },
  { number: 3, start: '11:10', end: '12:00' },
  { number: 4, start: '12:10', end: '13:00' },
  { number: 5, start: '14:00', end: '14:50' },
  { number: 6, start: '15:00', end: '15:50' },
  { number: 7, start: '16:00', end: '16:50' },
]

export const LUNCH = { start: '13:00', end: '14:00' }

export const WEEKDAYS = [
  { id: 'mon', label: '월', jsDay: 1, periodCount: 6 },
  { id: 'tue', label: '화', jsDay: 2, periodCount: 6 },
  { id: 'wed', label: '수', jsDay: 3, periodCount: 7 },
  { id: 'thu', label: '목', jsDay: 4, periodCount: 6 },
  { id: 'fri', label: '금', jsDay: 5, periodCount: 7 },
]

export const TIMETABLE_STORAGE_KEY = 'school.timetable.weekly.v1'
export const OVERRIDES_STORAGE_KEY = 'school.timetable.overrides.v1'

const DAY_BY_JS = Object.fromEntries(WEEKDAYS.map((day) => [day.jsDay, day]))

export function timeToMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function createEmptyWeeklySchedule() {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [
      day.id,
      Object.fromEntries(
        Array.from({ length: day.periodCount }, (_, index) => [index + 1, '']),
      ),
    ]),
  )
}

export function normalizeWeeklySchedule(value) {
  const empty = createEmptyWeeklySchedule()
  if (!value || typeof value !== 'object') return empty

  for (const day of WEEKDAYS) {
    for (let period = 1; period <= day.periodCount; period += 1) {
      const subject = value?.[day.id]?.[period]
      empty[day.id][period] = typeof subject === 'string' ? subject.slice(0, 20) : ''
    }
  }

  return empty
}

export function normalizeOverrides(value) {
  if (!value || typeof value !== 'object') return {}
  const normalized = {}

  for (const [dateKeyValue, periodMap] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKeyValue) || !periodMap || typeof periodMap !== 'object') continue
    const date = dateFromKey(dateKeyValue)
    const day = DAY_BY_JS[date.getDay()]
    if (!day) continue

    const nextMap = {}
    for (let period = 1; period <= PERIODS.length; period += 1) {
      if (!Object.prototype.hasOwnProperty.call(periodMap, period)) continue
      const subject = periodMap[period]
      if (typeof subject === 'string') nextMap[period] = subject.slice(0, 20)
    }

    if (Object.keys(nextMap).length) normalized[dateKeyValue] = nextMap
  }

  return normalized
}

export function loadWeeklySchedule() {
  try {
    return normalizeWeeklySchedule(JSON.parse(localStorage.getItem(TIMETABLE_STORAGE_KEY) || 'null'))
  } catch {
    return createEmptyWeeklySchedule()
  }
}

export function loadOverrides() {
  try {
    return normalizeOverrides(JSON.parse(localStorage.getItem(OVERRIDES_STORAGE_KEY) || 'null'))
  } catch {
    return {}
  }
}

export function saveWeeklySchedule(schedule) {
  localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(normalizeWeeklySchedule(schedule)))
}

export function saveOverrides(overrides) {
  localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(normalizeOverrides(overrides)))
}

export function getDayForDate(date) {
  return DAY_BY_JS[date.getDay()] || null
}

export function getPeriodsForDay(dayId) {
  const day = WEEKDAYS.find((item) => item.id === dayId)
  if (!day) return []
  return PERIODS.slice(0, day.periodCount)
}

export function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromKey(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function getWeekDates(anchor = new Date()) {
  const start = new Date(anchor)
  start.setHours(12, 0, 0, 0)
  const jsDay = start.getDay()
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay
  start.setDate(start.getDate() + diffToMonday)

  return WEEKDAYS.map((_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function getScheduleForDate(date, weeklySchedule, overrides) {
  const day = getDayForDate(date)
  if (!day) return []

  const dateOverrides = overrides?.[dateKey(date)] || {}
  const overridePeriods = Object.keys(dateOverrides)
    .map(Number)
    .filter((period) => Number.isInteger(period) && period >= 1 && period <= PERIODS.length)
  const maxPeriod = Math.max(day.periodCount, ...overridePeriods, 0)

  return PERIODS.slice(0, maxPeriod).map((period) => {
    const baseSubject = period.number <= day.periodCount
      ? weeklySchedule?.[day.id]?.[period.number] || ''
      : ''
    const isOverride = Object.prototype.hasOwnProperty.call(dateOverrides, period.number)
    const subject = isOverride ? dateOverrides[period.number] : baseSubject

    return {
      ...period,
      subject,
      baseSubject,
      isOverride,
      isRegularPeriod: period.number <= day.periodCount,
    }
  })
}

export function hasAnyBaseSchedule(weeklySchedule) {
  return WEEKDAYS.some((day) =>
    Object.values(weeklySchedule?.[day.id] || {}).some((subject) => subject.trim()),
  )
}

function nextScheduledPeriod(schedule, nowMinutes) {
  return schedule.find((period) => timeToMinutes(period.start) > nowMinutes) || null
}

export function getSchoolState(now, weeklySchedule, overrides) {
  const schedule = getScheduleForDate(now, weeklySchedule, overrides)
  const day = getDayForDate(now)
  const configured = hasAnyBaseSchedule(weeklySchedule)

  if (!day) {
    return {
      kind: 'off',
      configured,
      schedule,
      current: null,
      next: null,
    }
  }

  if (!configured) {
    return {
      kind: 'unconfigured',
      configured: false,
      schedule,
      current: null,
      next: schedule[0] || null,
    }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const lunchStart = timeToMinutes(LUNCH.start)
  const lunchEnd = timeToMinutes(LUNCH.end)

  const current = schedule.find((period) => {
    const start = timeToMinutes(period.start)
    const end = timeToMinutes(period.end)
    return nowMinutes >= start && nowMinutes < end
  })

  if (current) {
    const next = schedule.find((period) => period.number === current.number + 1) || null
    return { kind: 'class', configured: true, schedule, current, next }
  }

  if (nowMinutes >= lunchStart && nowMinutes < lunchEnd) {
    return {
      kind: 'lunch',
      configured: true,
      schedule,
      current: null,
      next: schedule.find((period) => period.number === 5) || null,
    }
  }

  const first = schedule[0]
  if (first && nowMinutes < timeToMinutes(first.start)) {
    return { kind: 'before', configured: true, schedule, current: null, next: first }
  }

  const last = schedule[schedule.length - 1]
  if (last && nowMinutes >= timeToMinutes(last.end)) {
    return { kind: 'done', configured: true, schedule, current: null, next: null, last }
  }

  return {
    kind: 'break',
    configured: true,
    schedule,
    current: null,
    next: nextScheduledPeriod(schedule, nowMinutes),
  }
}

export function getPeriodVisualState(now, period) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const start = timeToMinutes(period.start)
  const end = timeToMinutes(period.end)
  if (nowMinutes >= start && nowMinutes < end) return 'current'
  if (nowMinutes >= end) return 'past'
  return 'future'
}
