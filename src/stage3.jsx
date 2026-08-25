import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const SUJI_SCHOOL = {
  officeCode: 'J10',
  schoolCode: '7530093',
  schoolName: '수지고등학교',
}

const NEIS_BASE = 'https://open.neis.go.kr/hub'
const MEAL_CACHE_KEY = 'school.stage3.meals.v1'
const ACADEMIC_CACHE_KEY = 'school.stage3.academic.v1'
const MEAL_CACHE_AGE = 1000 * 60 * 60 * 12
const ACADEMIC_CACHE_AGE = 1000 * 60 * 60 * 6
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

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

function daysBetween(from, to) {
  return Math.max(0, Math.round((dayStart(to) - dayStart(from)) / 86400000))
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
    // Data remains available for the current session.
  }
}

function getRows(payload, key) {
  const section = payload?.[key]
  if (!Array.isArray(section)) return []
  return section.find((block) => Array.isArray(block?.row))?.row || []
}

async function neisRequest(path, params, signal) {
  const url = new URL(`${NEIS_BASE}/${path}`)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', '1000')
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }

  const response = await fetch(url.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`NEIS ${path} ${response.status}`)
  return response.json()
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

function normalizeAcademic(row) {
  const raw = String(row.AA_YMD || '')
  return {
    rawDate: raw,
    date: dateFromRaw(raw),
    name: String(row.EVENT_NM || '').trim(),
    content: String(row.EVENT_CNTNT || '').trim(),
    dayOffType: String(row.SBTR_DD_SC_NM || '').trim(),
    secondGrade: row.TW_GRADE_EVENT_YN !== 'N',
  }
}

async function fetchMealRange(fromDate, toDate, signal) {
  const payload = await neisRequest('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: SUJI_SCHOOL.officeCode,
    SD_SCHUL_CODE: SUJI_SCHOOL.schoolCode,
    MLSV_FROM_YMD: rawDate(fromDate),
    MLSV_TO_YMD: rawDate(toDate),
  }, signal)

  return getRows(payload, 'mealServiceDietInfo')
    .map(normalizeMeal)
    .filter((meal) => meal.rawDate && meal.dishes.length)
    .sort((a, b) => `${a.rawDate}-${a.mealCode}`.localeCompare(`${b.rawDate}-${b.mealCode}`))
}

async function fetchAcademicRange(fromDate, toDate, signal) {
  const payload = await neisRequest('SchoolSchedule', {
    ATPT_OFCDC_SC_CODE: SUJI_SCHOOL.officeCode,
    SD_SCHUL_CODE: SUJI_SCHOOL.schoolCode,
    AA_FROM_YMD: rawDate(fromDate),
    AA_TO_YMD: rawDate(toDate),
  }, signal)

  return getRows(payload, 'SchoolSchedule')
    .map(normalizeAcademic)
    .filter((event) => event.date && event.name && event.secondGrade)
    .sort((a, b) => a.rawDate.localeCompare(b.rawDate) || a.name.localeCompare(b.name))
}

function hydrateMealRanges() {
  return readStore(MEAL_CACHE_KEY).ranges || {}
}

function academicWindow(now) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  return { from, to: addDays(from, 220) }
}

function hydrateAcademic(now) {
  const { from, to } = academicWindow(now)
  const key = rangeKey(from, to)
  const cached = readStore(ACADEMIC_CACHE_KEY).ranges?.[key]
  return {
    events: Array.isArray(cached?.events)
      ? cached.events.map((event) => ({ ...event, date: dateFromRaw(event.rawDate) }))
      : [],
  }
}

export function useSchoolData(now) {
  const [mealRanges, setMealRanges] = useState(hydrateMealRanges)
  const mealRangesRef = useRef(mealRanges)
  const mealLoadingRef = useRef(new Set())
  const [mealLoadingVersion, setMealLoadingVersion] = useState(0)
  const [mealErrors, setMealErrors] = useState({})

  const initialAcademic = useMemo(() => hydrateAcademic(now), [])
  const [academicEvents, setAcademicEvents] = useState(initialAcademic.events)
  const [academicLoading, setAcademicLoading] = useState(false)
  const [academicError, setAcademicError] = useState(null)
  const academicRequestRef = useRef(null)

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
      const meals = await fetchMealRange(dates[0], dates[4])
      const savedAt = Date.now()
      const nextEntry = { meals, savedAt }
      const nextRanges = { ...mealRangesRef.current, [key]: nextEntry }
      mealRangesRef.current = nextRanges
      setMealRanges(nextRanges)

      const store = readStore(MEAL_CACHE_KEY)
      const ranges = { ...(store.ranges || {}), [key]: nextEntry }
      const keys = Object.keys(ranges).sort().slice(-12)
      writeStore(MEAL_CACHE_KEY, { ranges: Object.fromEntries(keys.map((item) => [item, ranges[item]])) })
      return meals
    } catch (error) {
      setMealErrors((current) => ({ ...current, [key]: error }))
      return existing?.meals || []
    } finally {
      mealLoadingRef.current.delete(key)
      setMealLoadingVersion((value) => value + 1)
    }
  }, [])

  const refreshAcademic = useCallback(async (force = false) => {
    const { from, to } = academicWindow(new Date())
    const key = rangeKey(from, to)
    const store = readStore(ACADEMIC_CACHE_KEY)
    const cached = store.ranges?.[key]
    const fresh = cached && Date.now() - Number(cached.savedAt || 0) < ACADEMIC_CACHE_AGE

    if (!force && fresh && Array.isArray(cached.events)) {
      setAcademicEvents(cached.events.map((event) => ({ ...event, date: dateFromRaw(event.rawDate) })))
      return
    }

    academicRequestRef.current?.abort()
    const controller = new AbortController()
    academicRequestRef.current = controller
    setAcademicLoading(true)
    setAcademicError(null)

    try {
      const events = await fetchAcademicRange(from, to, controller.signal)
      setAcademicEvents(events)
      const serializable = events.map(({ date, ...event }) => event)
      writeStore(ACADEMIC_CACHE_KEY, {
        ranges: {
          ...(store.ranges || {}),
          [key]: { savedAt: Date.now(), events: serializable },
        },
      })
    } catch (error) {
      if (error.name !== 'AbortError') setAcademicError(error)
    } finally {
      if (academicRequestRef.current === controller) academicRequestRef.current = null
      setAcademicLoading(false)
    }
  }, [])

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

function mealForDate(meals, date) {
  const key = rawDate(date)
  const sameDay = (meals || []).filter((meal) => meal.rawDate === key)
  return sameDay.find((meal) => meal.mealCode === '2') || sameDay[0] || null
}

function formatWeekRange(dates) {
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.getMonth() === last.getMonth()) return `${first.getMonth() + 1}월 ${first.getDate()}–${last.getDate()}일`
  return `${first.getMonth() + 1}월 ${first.getDate()}일–${last.getMonth() + 1}월 ${last.getDate()}일`
}

function formatDate(date, includeYear = false) {
  if (!date) return ''
  const prefix = includeYear ? `${date.getFullYear()}년 ` : ''
  return `${prefix}${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_LABELS[date.getDay()]}요일`
}

function relativeWeekLabel(offset) {
  if (offset === 0) return '이번 주'
  if (offset === 1) return '다음 주'
  if (offset === -1) return '지난 주'
  return offset > 1 ? `${offset}주 후` : `${Math.abs(offset)}주 전`
}

export function MealPreview({ now, schoolData }) {
  const week = schoolData.mealWeek(0)
  const meal = mealForDate(week.meals, now)

  return (
    <section className="home-section meal-preview stage3-home-block">
      <div className="section-heading"><h2>오늘 급식</h2></div>
      <div className="stage3-home-surface">
        {meal ? (
          <>
            <p className="stage3-meal-home-menu">{meal.dishes.slice(0, 5).join(' · ')}</p>
            <span className="stage3-home-meta">
              {[meal.dishes.length > 5 ? `외 ${meal.dishes.length - 5}개` : '', meal.calories].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : week.loading ? (
          <p className="stage3-home-muted">급식 불러오는 중…</p>
        ) : (
          <p className="stage3-home-muted">{week.error ? '급식 정보를 불러오지 못했어.' : '오늘은 NEIS에 등록된 급식이 없어.'}</p>
        )}
      </div>
    </section>
  )
}

export function MealPage({ schoolData }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const day = new Date().getDay()
    return day >= 1 && day <= 5 ? day - 1 : 0
  })
  const [direction, setDirection] = useState(1)
  const week = schoolData.mealWeek(weekOffset)
  const selectedDate = week.dates[selectedIndex] || week.dates[0]
  const meal = mealForDate(week.meals, selectedDate)

  useEffect(() => {
    schoolData.ensureMealWeek(weekOffset)
  }, [weekOffset])

  function selectDay(index) {
    if (index === selectedIndex) return
    setDirection(index > selectedIndex ? 1 : -1)
    setSelectedIndex(index)
  }

  function moveWeek(delta) {
    setDirection(delta > 0 ? 1 : -1)
    setWeekOffset((value) => value + delta)
  }

  function backToCurrentWeek() {
    if (weekOffset === 0) return
    setDirection(weekOffset > 0 ? -1 : 1)
    setWeekOffset(0)
  }

  return (
    <section className="stage3-page">
      <header className="page-header stage3-page-header">
        <p className="date-label">{SUJI_SCHOOL.schoolName}</p>
        <h1>급식</h1>
      </header>

      <div className="stage3-week-nav">
        <button onClick={() => moveWeek(-1)} aria-label="이전 주">‹</button>
        <button className="stage3-week-title" onClick={backToCurrentWeek}>
          <strong>{relativeWeekLabel(weekOffset)}</strong>
          <span>{formatWeekRange(week.dates)}</span>
        </button>
        <button onClick={() => moveWeek(1)} aria-label="다음 주">›</button>
      </div>

      <div className="stage3-day-strip">
        {week.dates.map((date, index) => (
          <button
            key={rawDate(date)}
            className={`stage3-day-button ${index === selectedIndex ? 'is-selected' : ''} ${rawDate(date) === rawDate(new Date()) ? 'is-today' : ''}`}
            onClick={() => selectDay(index)}
          >
            <strong>{WEEKDAY_LABELS[date.getDay()]}</strong>
            <span>{date.getMonth() + 1}/{date.getDate()}</span>
          </button>
        ))}
      </div>

      <section
        className="stage3-detail stage3-detail-motion"
        key={`${weekOffset}-${selectedIndex}`}
        style={{ '--stage3-direction': direction }}
      >
        {meal ? (
          <>
            <p className="stage3-detail-date">{formatDate(selectedDate)} · {meal.mealName}</p>
            <h2>급식</h2>
            <ul className="stage3-meal-list">
              {meal.dishes.map((dish) => <li key={dish}>{dish}</li>)}
            </ul>
            {meal.calories ? <p className="stage3-detail-meta">{meal.calories}</p> : null}
          </>
        ) : week.loading ? (
          <div className="stage3-status"><strong>급식 불러오는 중</strong><p>{formatWeekRange(week.dates)} 급식을 확인하고 있어.</p></div>
        ) : (
          <div className="stage3-status">
            <strong>{week.error ? '급식을 불러오지 못했어' : '등록된 급식이 없어'}</strong>
            <p>{week.error ? '인터넷 연결이나 NEIS 응답을 확인해줘.' : `${formatDate(selectedDate)} 급식이 아직 NEIS에 등록되지 않았어.`}</p>
            {week.error ? <button onClick={() => schoolData.ensureMealWeek(weekOffset, true)}>다시 불러오기</button> : null}
          </div>
        )}
      </section>
    </section>
  )
}

function isRoutineAcademic(event) {
  return /토요휴업일/.test(event.name)
}

function isImportantExam(event) {
  return /중간|기말|정기시험|정기고사|지필/.test(event.name)
}

function groupAcademicEvents(events) {
  const filtered = events
    .filter((event) => event.date && event.secondGrade && !isRoutineAcademic(event))
    .sort((a, b) => a.rawDate.localeCompare(b.rawDate) || a.name.localeCompare(b.name))

  const groups = []
  for (const event of filtered) {
    const last = groups[groups.length - 1]
    const consecutive = last && last.name === event.name && daysBetween(last.endDate, event.date) === 1
    if (consecutive) {
      last.endDate = event.date
      last.endRawDate = event.rawDate
    } else {
      groups.push({
        name: event.name,
        content: event.content,
        dayOffType: event.dayOffType,
        startDate: event.date,
        endDate: event.date,
        startRawDate: event.rawDate,
        endRawDate: event.rawDate,
      })
    }
  }
  return groups
}

function dDayLabel(now, date) {
  const days = daysBetween(now, date)
  return days === 0 ? '오늘' : `D-${days}`
}

function academicDateRange(group) {
  const start = group.startDate
  const end = group.endDate
  if (rawDate(start) === rawDate(end)) return `${start.getMonth() + 1}/${start.getDate()} ${WEEKDAY_LABELS[start.getDay()]}`
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`
}

export function AcademicPreview({ now, schoolData }) {
  const groups = useMemo(() => groupAcademicEvents(schoolData.academicEvents), [schoolData.academicEvents])
  const todayRaw = rawDate(now)
  const upcoming = groups.filter((group) => group.endRawDate >= todayRaw)
  const exam = upcoming.find((group) => isImportantExam(group)) || null
  const others = upcoming.filter((group) => group !== exam).slice(0, exam ? 2 : 3)

  return (
    <section className="home-section stage3-home-block academic-preview">
      <div className="section-heading"><h2>학사일정</h2></div>
      <div className="academic-home-list">
        {exam ? (
          <div className="academic-home-item is-important">
            <div><span>시험</span><strong>{exam.name}</strong></div>
            <b>{dDayLabel(now, exam.startDate)}</b>
          </div>
        ) : null}
        {others.map((group) => (
          <div className="academic-home-item" key={`${group.startRawDate}-${group.name}`}>
            <div><span>{academicDateRange(group)}</span><strong>{group.name}</strong></div>
            <b>{dDayLabel(now, group.startDate)}</b>
          </div>
        ))}
        {!exam && !others.length ? (
          <p className="stage3-home-muted">{schoolData.academicLoading ? '학사일정 불러오는 중…' : schoolData.academicError ? '학사일정을 불러오지 못했어.' : '다가오는 학사일정이 없어.'}</p>
        ) : null}
      </div>
    </section>
  )
}

export function AcademicPage({ now, schoolData }) {
  const groups = useMemo(() => groupAcademicEvents(schoolData.academicEvents), [schoolData.academicEvents])
  const todayRaw = rawDate(now)
  const upcoming = groups.filter((group) => group.endRawDate >= todayRaw)
  const exam = upcoming.find((group) => isImportantExam(group)) || null

  return (
    <section className="stage3-page academic-page">
      <header className="page-header stage3-page-header">
        <p className="date-label">2학년 · {SUJI_SCHOOL.schoolName}</p>
        <h1>학사일정</h1>
      </header>

      {exam ? (
        <section className="academic-focus-card">
          <p>가장 가까운 정기시험</p>
          <div><h2>{exam.name}</h2><strong>{dDayLabel(now, exam.startDate)}</strong></div>
          <span>{formatDate(exam.startDate, true)}{exam.endRawDate !== exam.startRawDate ? ` – ${formatDate(exam.endDate)}` : ''}</span>
        </section>
      ) : null}

      <div className="academic-list-head">
        <h2>다가오는 일정</h2>
        <span>{upcoming.length}개</span>
      </div>

      <div className="academic-list">
        {upcoming.map((group) => (
          <article className={`academic-list-item ${isImportantExam(group) ? 'is-important' : ''}`} key={`${group.startRawDate}-${group.name}`}>
            <div className="academic-list-date">
              <strong>{group.startDate.getDate()}</strong>
              <span>{group.startDate.getMonth() + 1}월</span>
            </div>
            <div className="academic-list-copy">
              <h3>{group.name}</h3>
              <p>{academicDateRange(group)}{group.dayOffType && group.dayOffType !== '해당없음' ? ` · ${group.dayOffType}` : ''}</p>
            </div>
            <b>{dDayLabel(now, group.startDate)}</b>
          </article>
        ))}
      </div>

      {!upcoming.length ? (
        <div className="stage3-status academic-status">
          <strong>{schoolData.academicLoading ? '학사일정 불러오는 중' : schoolData.academicError ? '학사일정을 불러오지 못했어' : '다가오는 일정이 없어'}</strong>
          {schoolData.academicError ? <button onClick={() => schoolData.refreshAcademic(true)}>다시 불러오기</button> : null}
        </div>
      ) : null}
    </section>
  )
}
