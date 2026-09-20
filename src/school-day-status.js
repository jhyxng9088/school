import { schoolScopeKey } from './school-directory.js'

const CLOSURE_CACHE_PREFIX = 'school.closureDates.v1'
const CLOSURE_EVENT = 'school:closure-snapshot-updated'

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

function normalizeClosureEntry(value) {
  const rawDate = String(value?.rawDate || '').trim()
  if (!/^\d{8}$/.test(rawDate)) return null
  const label = String(value?.label || value?.name || value?.dayOffType || '휴업일').trim() || '휴업일'
  return {
    rawDate,
    label,
    dayOffType: String(value?.dayOffType || '휴업일').trim() || '휴업일',
  }
}

function closureCacheKey(profile) {
  const scope = schoolScopeKey(profile)
  return scope ? `${CLOSURE_CACHE_PREFIX}.${scope}` : ''
}

function normalizedClosureList(values) {
  const byDate = new Map()
  ;(Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeClosureEntry(value)
    if (normalized) byDate.set(normalized.rawDate, normalized)
  })
  return [...byDate.values()].sort((a, b) => a.rawDate.localeCompare(b.rawDate)).slice(-180)
}

export function readSchoolClosureSnapshot(profile) {
  if (typeof localStorage === 'undefined') return []
  const key = closureCacheKey(profile)
  if (!key) return []
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    return normalizedClosureList(stored?.closures)
  } catch {
    return []
  }
}

function publishClosureSnapshot(profile, closures) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CLOSURE_EVENT, {
    detail: {
      scope: schoolScopeKey(profile),
      closures,
    },
  }))
}

export function replaceSchoolClosureSnapshot(profile, values) {
  const key = closureCacheKey(profile)
  if (!key || typeof localStorage === 'undefined') return []
  const closures = normalizedClosureList(values)
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), closures }))
  } catch {
    // Closure UI can still use the live payload when persistent storage is unavailable.
  }
  publishClosureSnapshot(profile, closures)
  return closures
}

export function mergeSchoolClosureSnapshot(profile, values) {
  const previous = readSchoolClosureSnapshot(profile)
  const closures = normalizedClosureList([...previous, ...(Array.isArray(values) ? values : [])])
  const key = closureCacheKey(profile)
  if (!key || typeof localStorage === 'undefined') return closures
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), closures }))
  } catch {
    // Keep the live snapshot even if storage fails.
  }
  publishClosureSnapshot(profile, closures)
  return closures
}

export function closuresFromAcademicEvents(events = []) {
  return normalizedClosureList(
    (Array.isArray(events) ? events : [])
      .filter((event) => isSchoolClosureDayOffType(event?.dayOffType))
      .map((event) => ({
        rawDate: event.rawDate,
        label: event.name || event.dayOffType || '휴업일',
        dayOffType: event.dayOffType || '휴업일',
      })),
  )
}

export function subscribeSchoolClosureSnapshot(profile, onValue) {
  if (typeof window === 'undefined' || typeof onValue !== 'function') return () => {}
  const scope = schoolScopeKey(profile)
  const handler = (event) => {
    if (event?.detail?.scope !== scope) return
    onValue(normalizedClosureList(event.detail.closures))
  }
  window.addEventListener(CLOSURE_EVENT, handler)
  return () => window.removeEventListener(CLOSURE_EVENT, handler)
}

export function schoolClosureForDate(date, academicEvents = [], schedule = [], cachedClosures = []) {
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

  const cached = normalizedClosureList(cachedClosures).find((item) => item.rawDate === rawDate)
  if (cached) return cached

  const inferred = inferSchoolClosureFromSchedule(schedule)
  return inferred ? { rawDate, ...inferred } : null
}

export function nextOpenSchoolDate(anchor, academicEvents = [], {
  includeAnchor = false,
  maxDays = 21,
  scheduleForDate = null,
  cachedClosures = [],
} = {}) {
  const date = new Date(anchor)
  date.setHours(12, 0, 0, 0)
  if (!includeAnchor) date.setDate(date.getDate() + 1)

  for (let index = 0; index <= maxDays; index += 1) {
    const day = date.getDay()
    const schedule = typeof scheduleForDate === 'function' ? scheduleForDate(date) : []
    if (day !== 0 && day !== 6 && !schoolClosureForDate(date, academicEvents, schedule, cachedClosures)) return date
    date.setDate(date.getDate() + 1)
  }

  return date
}
