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
  { id: 'mon', label: '월', jsDay: 1, periodCount: 7, regularPeriodCount: 6 },
  { id: 'tue', label: '화', jsDay: 2, periodCount: 7, regularPeriodCount: 6 },
  { id: 'wed', label: '수', jsDay: 3, periodCount: 7, regularPeriodCount: 7 },
  { id: 'thu', label: '목', jsDay: 4, periodCount: 7, regularPeriodCount: 6 },
  { id: 'fri', label: '금', jsDay: 5, periodCount: 7, regularPeriodCount: 7 },
]

export const TIMETABLE_STORAGE_KEY = 'school.timetable.weekly.v2'
export const OVERRIDES_STORAGE_KEY = 'school.timetable.overrides.v2'

export const DEFAULT_WEEKLY_SCHEDULE = {
  mon: {
    1: '역학',
    2: '영어 II',
    3: '스과',
    4: '화언A',
    5: '정보',
    6: '세포',
  },
  tue: {
    1: '물질',
    2: '진로',
    3: '정보',
    4: '기하2',
    5: '미적2',
    6: '영어 II',
  },
  wed: {
    1: '물질',
    2: '정보',
    3: '역학',
    4: '기하2',
    5: '미적2',
    6: '화언B',
    7: '세포',
  },
  thu: {
    1: '정보',
    2: '기하2',
    3: '역학',
    4: '미적2',
    5: '영어 II',
    6: '화언B',
  },
  fri: {
    1: '영어 II',
    2: '세포',
    3: '화언A',
    4: '물질',
    5: '미적2',
    6: '자율',
    7: '자율',
  },
}

const FULL_SUBJECT_NAMES = {
  역학: '역학과 에너지',
  스과: '스포츠과학',
  화언A: '화법과 언어A',
  화언B: '화법과 언어B',
  세포: '세포와 물질대사',
  물질: '물질과 에너지',
  미적2: '미적분',
  기하2: '기하',
}

const SUBJECT_ALIASES = {
  역학: ['역학', '역학과 에너지', '역학에너지'],
  '영어 II': ['영어 II', '영어II', '영어Ⅱ', '영어2'],
  스과: ['스과', '스포츠과학', '스포츠 과학'],
  화언A: ['화언A', '화언 A', '화법과 언어A', '화법과언어A'],
  정보: ['정보'],
  세포: ['세포', '세포와 물질대사', '세포물질대사'],
  물질: ['물질', '물질과 에너지', '물질에너지'],
  진로: ['진로'],
  기하2: ['기하2', '기하', '기하 II', '기하Ⅱ'],
  미적2: ['미적2', '미적분', '미적분2', '미적분 II', '미적분Ⅱ'],
  화언B: ['화언B', '화언 B', '화법과 언어B', '화법과언어B'],
  자율: ['자율'],
}

const DAY_BY_JS = Object.fromEntries(WEEKDAYS.map((day) => [day.jsDay, day]))

function simplifySubject(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

const ALIAS_ENTRIES = Object.entries(SUBJECT_ALIASES).flatMap(([canonical, aliases]) =>
  aliases.map((alias) => ({ canonical, key: simplifySubject(alias) })),
)

const EXACT_ALIAS_MAP = new Map(ALIAS_ENTRIES.map(({ canonical, key }) => [key, canonical]))

function editDistance(left, right) {
  const a = Array.from(left)
  const b = Array.from(right)
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }

  return previous[b.length]
}

function hasConflictingMarker(inputKey, aliasKey) {
  const inputDigit = inputKey.match(/\d$/)?.[0]
  const aliasDigit = aliasKey.match(/\d$/)?.[0]
  if (inputDigit && aliasDigit && inputDigit !== aliasDigit) return true

  const inputLetter = inputKey.match(/[ab]$/)?.[0]
  const aliasLetter = aliasKey.match(/[ab]$/)?.[0]
  return Boolean(inputLetter && aliasLetter && inputLetter !== aliasLetter)
}

export function normalizeSubjectInput(value) {
  const original = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!original) return ''

  const inputKey = simplifySubject(original)
  const exact = EXACT_ALIAS_MAP.get(inputKey)
  if (exact) return exact
  if (inputKey.length < 3) return original.slice(0, 20)

  let bestDistance = Infinity
  let bestCanonical = null
  let bestAliasLength = 0
  let ambiguous = false

  for (const { canonical, key } of ALIAS_ENTRIES) {
    if (hasConflictingMarker(inputKey, key)) continue
    const distance = editDistance(inputKey, key)

    if (distance < bestDistance) {
      bestDistance = distance
      bestCanonical = canonical
      bestAliasLength = key.length
      ambiguous = false
    } else if (distance === bestDistance && canonical !== bestCanonical) {
      ambiguous = true
    }
  }

  const comparisonLength = Math.max(inputKey.length, bestAliasLength)
  const allowedDistance = comparisonLength >= 8 ? 2 : 1
  if (!ambiguous && bestCanonical && bestDistance <= allowedDistance) return bestCanonical

  return original.slice(0, 20)
}

export function timeToMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function createEmptyWeeklySchedule() {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [
      day.id,
      Object.fromEntries(
        Array.from({ length: day.regularPeriodCount }, (_, index) => [index + 1, '']),
      ),
    ]),
  )
}

export function createDefaultWeeklySchedule() {
  return normalizeWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE)
}

export function normalizeWeeklySchedule(value) {
  const empty = createEmptyWeeklySchedule()
  if (!value || typeof value !== 'object') return empty

  for (const day of WEEKDAYS) {
    for (let period = 1; period <= day.regularPeriodCount; period += 1) {
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
      if (typeof subject === 'string') nextMap[period] = normalizeSubjectInput(subject)
    }

    if (Object.keys(nextMap).length) normalized[dateKeyValue] = nextMap
  }

  return normalized
}

export function loadWeeklySchedule() {
  try {
    const stored = localStorage.getItem(TIMETABLE_STORAGE_KEY)
    if (!stored) return createDefaultWeeklySchedule()
    return normalizeWeeklySchedule(JSON.parse(stored))
  } catch {
    return createDefaultWeeklySchedule()
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
  return PERIODS
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
  const maxPeriod = Math.max(day.regularPeriodCount, ...overridePeriods, 0)

  return PERIODS.slice(0, maxPeriod).map((period) => {
    const baseSubject = period.number <= day.regularPeriodCount
      ? weeklySchedule?.[day.id]?.[period.number] || ''
      : ''
    const hasOverride = Object.prototype.hasOwnProperty.call(dateOverrides, period.number)
    const overrideSubject = hasOverride ? normalizeSubjectInput(dateOverrides[period.number]) : ''
    const subject = hasOverride ? overrideSubject : baseSubject
    const isOverride = hasOverride && overrideSubject !== baseSubject

    return {
      ...period,
      subject,
      baseSubject,
      isOverride,
      isRegularPeriod: period.number <= day.regularPeriodCount,
    }
  })
}

export function hasAnyBaseSchedule(weeklySchedule) {
  return WEEKDAYS.some((day) =>
    Object.values(weeklySchedule?.[day.id] || {}).some((subject) => subject.trim()),
  )
}

export function getFullSubjectName(subject) {
  const compact = typeof subject === 'string' ? subject.trim() : ''
  if (!compact) return '과목 미설정'
  return FULL_SUBJECT_NAMES[compact] || compact
}

function displayPeriod(period) {
  if (!period) return null
  return {
    ...period,
    subject: getFullSubjectName(period.subject),
  }
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
      next: displayPeriod(schedule[0] || null),
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
    return {
      kind: 'class',
      configured: true,
      schedule,
      current: displayPeriod(current),
      next: displayPeriod(next),
    }
  }

  if (nowMinutes >= lunchStart && nowMinutes < lunchEnd) {
    return {
      kind: 'lunch',
      configured: true,
      schedule,
      current: null,
      next: displayPeriod(schedule.find((period) => period.number === 5) || null),
    }
  }

  const first = schedule[0]
  if (first && nowMinutes < timeToMinutes(first.start)) {
    return {
      kind: 'before',
      configured: true,
      schedule,
      current: null,
      next: displayPeriod(first),
    }
  }

  const last = schedule[schedule.length - 1]
  if (last && nowMinutes >= timeToMinutes(last.end)) {
    return {
      kind: 'done',
      configured: true,
      schedule,
      current: null,
      next: null,
      last: displayPeriod(last),
    }
  }

  return {
    kind: 'break',
    configured: true,
    schedule,
    current: null,
    next: displayPeriod(nextScheduledPeriod(schedule, nowMinutes)),
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
