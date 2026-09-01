import { IMPORTANT_PREFIX } from './schedule-logic.js'

const NEIS_BASE = 'https://open.neis.go.kr/hub'
const SUJI_SCHOOL = {
  officeCode: 'J10',
  schoolCode: '7530093',
}

const MOCK_EXAMS = [
  { rawDate: '20260324', name: '3월 전국연합학력평가', content: '고2 · 서울특별시교육청 주관' },
  { rawDate: '20260604', name: '6월 전국연합학력평가', content: '고2 · 부산광역시교육청 주관' },
  { rawDate: '20260902', name: '9월 전국연합학력평가', content: '고2 · 인천광역시교육청 주관' },
  { rawDate: '20261020', name: '10월 전국연합학력평가', content: '고2 · 경기도교육청 주관' },
]

function rawDateFromKey(value) {
  const key = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key.replaceAll('-', '') : ''
}

function dateKeyFromRaw(value) {
  const raw = String(value || '')
  if (!/^\d{8}$/.test(raw)) return ''
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function gradeFlag(row, key) {
  return String(row?.[key] ?? '').trim().toUpperCase()
}

function relevantToSecondGrade(row) {
  const first = gradeFlag(row, 'ONE_GRADE_EVENT_YN')
  const second = gradeFlag(row, 'TW_GRADE_EVENT_YN')
  const third = gradeFlag(row, 'THREE_GRADE_EVENT_YN')
  const anyExplicitGrade = [first, second, third].some((value) => value === 'Y')
  return second === 'Y' || !anyExplicitGrade
}

export function isImportantAcademicTitle(value) {
  return /중간|기말|정기시험|정기고사|지필|1차.*(시험|고사)|2차.*(시험|고사)|모의고사|전국연합|학력평가|평가원|수능|대학수학능력시험/.test(String(value || ''))
}

function isRoutineAcademicTitle(value) {
  return /토요휴업일/.test(String(value || ''))
}

function eventId(rawDate, title, suffix = '') {
  const compactTitle = String(title || '')
    .normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(/[^0-9A-Za-z가-힣_-]/g, '')
    .slice(0, 48)
  return `official-${rawDate}-${compactTitle || 'academic'}${suffix}`
}

function asImportantEvent({ rawDate, title, content = '', id = '' }) {
  const startDate = dateKeyFromRaw(rawDate)
  if (!startDate || !title) return null
  return {
    id: id || eventId(rawDate, title),
    title: String(title).trim().slice(0, 80),
    startDate,
    endDate: startDate,
    detail: `${IMPORTANT_PREFIX}${String(content || '').trim().slice(0, 420)}`,
    source: 'official',
  }
}

export function normalizeOfficialAcademicRows(rows, requestedRawDates = []) {
  const requested = new Set((requestedRawDates || []).map(String).filter((value) => /^\d{8}$/.test(value)))
  return (rows || [])
    .map((row, index) => {
      const rawDate = String(row?.AA_YMD || '')
      const title = String(row?.EVENT_NM || '').trim()
      if (!rawDate || (requested.size && !requested.has(rawDate))) return null
      if (!title || isRoutineAcademicTitle(title) || !isImportantAcademicTitle(title)) return null
      if (!relevantToSecondGrade(row)) return null
      return asImportantEvent({
        rawDate,
        title,
        content: String(row?.EVENT_CNTNT || '').trim(),
        id: eventId(rawDate, title, `-${index}`),
      })
    })
    .filter(Boolean)
}

function rowsFromPayload(payload) {
  const section = payload?.SchoolSchedule
  if (!Array.isArray(section)) return []
  return section.find((block) => Array.isArray(block?.row))?.row || []
}

function fallbackEvents(rawDates) {
  const requested = new Set(rawDates)
  return MOCK_EXAMS
    .filter((exam) => requested.has(exam.rawDate))
    .map((exam) => asImportantEvent({
      rawDate: exam.rawDate,
      title: exam.name,
      content: exam.content,
      id: eventId(exam.rawDate, exam.name, '-fallback'),
    }))
    .filter(Boolean)
}

function dedupeEvents(events) {
  const byKey = new Map()
  for (const event of events || []) {
    const key = `${String(event?.startDate || '')}\u0000${String(event?.title || '').normalize('NFKC').trim()}`
    if (!event?.startDate || !event?.title || byKey.has(key)) continue
    byKey.set(key, event)
  }
  return [...byKey.values()]
}

async function fetchDate(rawDate, fetchImpl) {
  const url = new URL(`${NEIS_BASE}/SchoolSchedule`)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', '500')
  url.searchParams.set('ATPT_OFCDC_SC_CODE', SUJI_SCHOOL.officeCode)
  url.searchParams.set('SD_SCHUL_CODE', SUJI_SCHOOL.schoolCode)
  url.searchParams.set('AA_FROM_YMD', rawDate)
  url.searchParams.set('AA_TO_YMD', rawDate)

  const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(4500)
    : undefined
  const response = await fetchImpl(url, { cache: 'no-store', signal: timeoutSignal })
  if (!response.ok) throw new Error(`NEIS SchoolSchedule ${response.status}`)
  const payload = await response.json()
  const result = payload?.RESULT
  if (result?.CODE && !['INFO-000', 'INFO-200'].includes(String(result.CODE))) {
    throw new Error(result.MESSAGE || `NEIS SchoolSchedule ${result.CODE}`)
  }
  return rowsFromPayload(payload)
}

export async function officialImportantAcademicEventsForDates(dateKeys, fetchImpl = globalThis.fetch) {
  const rawDates = [...new Set((dateKeys || []).map(rawDateFromKey).filter(Boolean))]
  if (!rawDates.length || typeof fetchImpl !== 'function') return { events: fallbackEvents(rawDates), failedDates: [] }

  const rows = []
  const failedDates = []
  for (const rawDate of rawDates) {
    try {
      rows.push(...await fetchDate(rawDate, fetchImpl))
    } catch {
      failedDates.push(dateKeyFromRaw(rawDate))
    }
  }

  return {
    events: dedupeEvents([
      ...normalizeOfficialAcademicRows(rows, rawDates),
      ...fallbackEvents(rawDates),
    ]),
    failedDates,
  }
}
