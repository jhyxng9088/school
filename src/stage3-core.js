import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LEGACY_SCHOOL_CONTEXT, schoolScopeKey } from './school-directory.js'

const NEIS_BASE = 'https://open.neis.go.kr/hub'
const MEAL_CACHE_PREFIX = 'school.stage3.meals.v2'
const ACADEMIC_CACHE_PREFIX = 'school.stage3.academic.v4'
const MEAL_CACHE_AGE = 1000 * 60 * 60 * 12
const ACADEMIC_CACHE_AGE = 1000 * 60 * 60 * 6
const MOCK_EXAMS_GRADE2 = [
  { rawDate: '20260324', name: '3월 전국연합학력평가', content: '고2 · 서울특별시교육청 주관' },
  { rawDate: '20260604', name: '6월 전국연합학력평가', content: '고2 · 부산광역시교육청 주관' },
  { rawDate: '20260902', name: '9월 전국연합학력평가', content: '고2 · 인천광역시교육청 주관' },
  { rawDate: '20261020', name: '10월 전국연합학력평가', content: '고2 · 경기도교육청 주관' },
]

function schoolContext(profile) {
  const officeCode = String(profile?.officeCode || '').trim()
  const schoolCode = String(profile?.schoolCode || '').trim()
  const schoolName = String(profile?.schoolName || '').trim()
  const schoolKind = String(profile?.schoolKind || '').trim()
  const grade = Number(profile?.grade)
  if (!officeCode || !schoolCode || !Number.isInteger(grade) || grade < 1 || grade > 6) {
    return { ...LEGACY_SCHOOL_CONTEXT }
  }
  return { officeCode, schoolCode, schoolName, schoolKind, grade }
}

function mealCacheKey(profile) {
  return `${MEAL_CACHE_PREFIX}.${schoolScopeKey(schoolContext(profile)) || 'legacy'}`
}

function academicCacheKey(profile) {
  return `${ACADEMIC_CACHE_PREFIX}.${schoolScopeKey(schoolContext(profile)) || 'legacy'}`
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function rawDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function dateFromRaw(value) {
  if (!/^\d{8}$/.test(value || '')) return null
  return new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
    12, 0, 0, 0,
  )
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

function addDays(date, days) {
  const next = dayStart(date)
  next.setDate(next.getDate() + days)
  return next
}

function getWeekDates(anchor = new Date()) {
  const start = dayStart(anchor)
  const jsDay = start.getDay()
  start.setDate(start.getDate() + (jsDay === 0 ? -6 : 1 - jsDay))
  return Array.from({ length: 5 }, (_, index) => addDays(start, index))
}

function weekDatesForOffset(offset) {
  return getWeekDates(addDays(new Date(), offset * 7))
}

function rangeKey(fromDate, toDate) {
  return `${rawDate(fromDate)}-${rawDate(toDate)}`
}

function readStore(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : { ranges: {} }
  } catch {
    return { ranges: {} }
  }
}

function writeStore(key, store) {
  try {
    localStorage.setItem(key, JSON.stringify(store))
  } catch {
    // Keep current-session data even if persistent storage is unavailable.
  }
}

function getRows(payload, key) {
  const section = payload?.[key]
  if (!Array.isArray(section)) return []
  return section.find((block) => Array.isArray(block?.row))?.row || []
}

function rootResult(payload) {
  const result = payload?.RESULT
  return result && typeof result === 'object' ? result : null
}

async function neisRequest(path, params, signal, pSize = 500) {
  const url = new URL(`${NEIS_BASE}/${path}`)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', String(pSize))
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }

  const response = await fetch(url.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`NEIS ${path} ${response.status}`)
  const payload = await response.json()
  const result = rootResult(payload)
  if (result?.CODE && result.CODE !== 'INFO-000' && result.CODE !== 'INFO-200') {
    throw new Error(result.MESSAGE || `NEIS ${path} ${result.CODE}`)
  }
  return payload
}

function cleanDish(value) {
  return String(value || '')
    .replace(/\s*\([0-9.*]+\)\s*/g, ' ')
    .replace(/\s*\(S\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDishes(value) {
  return String(value || '')
    .split(/<br\s*\/?>|\n/gi)
    .map(cleanDish)
    .filter(Boolean)
}

function normalizeMeal(row) {
  return {
    rawDate: String(row.MLSV_YMD || ''),
    mealCode: String(row.MMEAL_SC_CODE || ''),
    mealName: row.MMEAL_SC_NM || '중식',
    dishes: parseDishes(row.DDISH_NM),
    calories: row.CAL_INFO || '',
  }
}

function gradeFlag(row, key) {
  return String(row?.[key] ?? '').trim().toUpperCase()
}

function academicRelevantToGrade(row, grade) {
  const flags = [
    gradeFlag(row, 'ONE_GRADE_EVENT_YN'),
    gradeFlag(row, 'TW_GRADE_EVENT_YN'),
    gradeFlag(row, 'THREE_GRADE_EVENT_YN'),
  ]
  const anyExplicitGrade = flags.some((value) => value === 'Y')
  if (!anyExplicitGrade) return true
  if (grade < 1 || grade > 3) return true
  return flags[grade - 1] === 'Y'
}

function normalizeAcademic(row, grade) {
  const raw = String(row.AA_YMD || '')
  return {
    rawDate: raw,
    date: dateFromRaw(raw),
    name: String(row.EVENT_NM || '').trim(),
    content: String(row.EVENT_CNTNT || '').trim(),
    dayOffType: String(row.SBTR_DD_SC_NM || '').trim(),
    relevantToGrade: academicRelevantToGrade(row, grade),
  }
}

async function fetchMealRange(profile, fromDate, toDate, signal) {
  const school = schoolContext(profile)
  const payload = await neisRequest('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: school.officeCode,
    SD_SCHUL_CODE: school.schoolCode,
    MLSV_FROM_YMD: rawDate(fromDate),
    MLSV_TO_YMD: rawDate(toDate),
  }, signal, 100)

  return getRows(payload, 'mealServiceDietInfo')
    .map(normalizeMeal)
    .filter((meal) => meal.rawDate && meal.dishes.length)
    .sort((a, b) => `${a.rawDate}-${a.mealCode}`.localeCompare(`${b.rawDate}-${b.mealCode}`))
}

async function fetchAcademicRange(profile, fromDate, toDate, signal) {
  const school = schoolContext(profile)
  const rows = []
  let cursor = dayStart(fromDate)
  const finalDate = dayStart(toDate)

  while (cursor <= finalDate) {
    const chunkEnd = addDays(cursor, 59)
    const safeEnd = chunkEnd > finalDate ? finalDate : chunkEnd
    const payload = await neisRequest('SchoolSchedule', {
      ATPT_OFCDC_SC_CODE: school.officeCode,
      SD_SCHUL_CODE: school.schoolCode,
      AA_FROM_YMD: rawDate(cursor),
      AA_TO_YMD: rawDate(safeEnd),
    }, signal, 500)
    rows.push(...getRows(payload, 'SchoolSchedule'))
    cursor = addDays(safeEnd, 1)
  }

  if (!rows.length) throw new Error('NEIS 학사일정 응답이 비어 있어.')

  const normalized = rows
    .map((row) => normalizeAcademic(row, school.grade))
    .filter((event) => event.date && event.name && event.relevantToGrade)
    .sort((a, b) => a.rawDate.localeCompare(b.rawDate) || a.name.localeCompare(b.name))

  if (/고등/.test(school.schoolKind) && school.grade === 2) {
    const fromRaw = rawDate(fromDate)
    const toRaw = rawDate(toDate)
    for (const exam of MOCK_EXAMS_GRADE2) {
      if (exam.rawDate < fromRaw || exam.rawDate > toRaw) continue
      const duplicate = normalized.some((event) => event.rawDate === exam.rawDate && /전국연합|학력평가|모의고사/.test(event.name))
      if (!duplicate) normalized.push({ ...exam, date: dateFromRaw(exam.rawDate), dayOffType: '해당없음', relevantToGrade: true })
    }
  }

  normalized.sort((a, b) => a.rawDate.localeCompare(b.rawDate) || a.name.localeCompare(b.name))
  if (!normalized.length) throw new Error(`${school.grade}학년 학사일정을 찾지 못했어.`)
  return normalized
}

function hydrateMealRanges(profile) {
  return readStore(mealCacheKey(profile)).ranges || {}
}

function academicWindow(now) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  return { from, to: addDays(from, 220) }
}

function hydrateAcademic(now, profile) {
  const { from, to } = academicWindow(now)
  const key = rangeKey(from, to)
  const cached = readStore(academicCacheKey(profile)).ranges?.[key]
  return {
    events: Array.isArray(cached?.events) && cached.events.length
      ? cached.events.map((event) => ({ ...event, date: dateFromRaw(event.rawDate) }))
      : [],
  }
}

export function useSchoolData(now, profile) {
  const scope = schoolScopeKey(schoolContext(profile)) || 'legacy'
  const [mealRanges, setMealRanges] = useState(() => hydrateMealRanges(profile))
  const mealRangesRef = useRef(mealRanges)
  const mealLoadingRef = useRef(new Set())
  const [mealLoadingVersion, setMealLoadingVersion] = useState(0)
  const [mealErrors, setMealErrors] = useState({})

  const initialAcademic = useMemo(() => hydrateAcademic(now, profile), [scope])
  const [academicEvents, setAcademicEvents] = useState(initialAcademic.events)
  const [academicLoading, setAcademicLoading] = useState(false)
  const [academicError, setAcademicError] = useState(null)
  const academicRequestRef = useRef(null)

  useEffect(() => {
    const nextRanges = hydrateMealRanges(profile)
    mealRangesRef.current = nextRanges
    setMealRanges(nextRanges)
    setMealErrors({})
    setAcademicEvents(hydrateAcademic(new Date(), profile).events)
  }, [scope])

  useEffect(() => {
    mealRangesRef.current = mealRanges
  }, [mealRanges])

  const ensureMealWeek = useCallback(async (offset, force = false) => {
    const dates = weekDatesForOffset(offset)
    const key = rangeKey(dates[0], dates[4])
    const existing = mealRangesRef.current[key]
    const fresh = existing && Date.now() - Number(existing.savedAt || 0) < MEAL_CACHE_AGE
    if (!force && fresh) return existing.meals || []
    if (mealLoadingRef.current.has(key)) return existing?.meals || []

    mealLoadingRef.current.add(key)
    setMealLoadingVersion((value) => value + 1)
    setMealErrors((current) => ({ ...current, [key]: null }))

    try {
      const meals = await fetchMealRange(profile, dates[0], dates[4])
      const savedAt = Date.now()
      const nextEntry = { meals, savedAt }
      const nextRanges = { ...mealRangesRef.current, [key]: nextEntry }
      mealRangesRef.current = nextRanges
      setMealRanges(nextRanges)

      const storeKey = mealCacheKey(profile)
      const store = readStore(storeKey)
      const ranges = { ...(store.ranges || {}), [key]: nextEntry }
      const keys = Object.keys(ranges).sort().slice(-12)
      writeStore(storeKey, { ranges: Object.fromEntries(keys.map((item) => [item, ranges[item]])) })
      return meals
    } catch (error) {
      setMealErrors((current) => ({ ...current, [key]: error }))
      return existing?.meals || []
    } finally {
      mealLoadingRef.current.delete(key)
      setMealLoadingVersion((value) => value + 1)
    }
  }, [scope])

  const refreshAcademic = useCallback(async (force = false) => {
    const { from, to } = academicWindow(new Date())
    const key = rangeKey(from, to)
    const storeKey = academicCacheKey(profile)
    const store = readStore(storeKey)
    const cached = store.ranges?.[key]
    const hasCachedEvents = Array.isArray(cached?.events) && cached.events.length > 0
    const fresh = hasCachedEvents && Date.now() - Number(cached.savedAt || 0) < ACADEMIC_CACHE_AGE

    if (!force && fresh) {
      setAcademicEvents(cached.events.map((event) => ({ ...event, date: dateFromRaw(event.rawDate) })))
      return
    }

    academicRequestRef.current?.abort()
    const controller = new AbortController()
    academicRequestRef.current = controller
    setAcademicLoading(true)
    setAcademicError(null)

    try {
      const events = await fetchAcademicRange(profile, from, to, controller.signal)
      setAcademicEvents(events)
      const serializable = events.map(({ date, ...event }) => event)
      writeStore(storeKey, {
        ranges: {
          ...(store.ranges || {}),
          [key]: { savedAt: Date.now(), events: serializable },
        },
      })
    } catch (error) {
      if (error.name !== 'AbortError') {
        setAcademicError(error)
        if (hasCachedEvents) {
          setAcademicEvents(cached.events.map((event) => ({ ...event, date: dateFromRaw(event.rawDate) })))
        }
      }
    } finally {
      if (academicRequestRef.current === controller) academicRequestRef.current = null
      setAcademicLoading(false)
    }
  }, [scope])

  useEffect(() => {
    ensureMealWeek(0)
    refreshAcademic(false)

    const prefetch = window.setTimeout(() => {
      ensureMealWeek(-1)
      ensureMealWeek(1)
    }, 1400)

    return () => window.clearTimeout(prefetch)
  }, [ensureMealWeek, refreshAcademic])

  function mealWeek(offset) {
    const dates = weekDatesForOffset(offset)
    const key = rangeKey(dates[0], dates[4])
    const entry = mealRanges[key]
    return {
      key,
      dates,
      meals: entry?.meals || [],
      loading: mealLoadingRef.current.has(key),
      error: mealErrors[key] || null,
      savedAt: Number(entry?.savedAt || 0),
    }
  }

  return {
    mealRanges,
    mealLoadingVersion,
    mealWeek,
    ensureMealWeek,
    academicEvents,
    academicLoading,
    academicError,
    refreshAcademic,
  }
}
