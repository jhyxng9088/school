import { normalizeWeeklySchedule } from './timetable.js'

export const NEIS_TIMETABLE_SCHOOL = {
  officeCode: 'J10',
  schoolCode: '7530093',
  schoolName: '수지고등학교',
  grade: 2,
}

const NEIS_BASE = 'https://open.neis.go.kr/hub'
const NEIS_MIRROR_URL = 'https://kschoolinfo.com/api/v1/timetable'
const DAY_KEYS = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function neisDateKey(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

export function neisTargetWeek(anchor = new Date()) {
  const date = new Date(anchor)
  date.setHours(12, 0, 0, 0)
  const jsDay = date.getDay()
  const offset = jsDay === 0 ? 1 : jsDay === 6 ? 2 : 1 - jsDay
  const monday = new Date(date)
  monday.setDate(date.getDate() + offset)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return {
    monday,
    friday,
    weekStart: neisDateKey(monday),
    weekEnd: neisDateKey(friday),
  }
}

function getOfficialRows(payload) {
  const section = payload?.hisTimetable
  if (!Array.isArray(section)) return []
  return section.find((block) => Array.isArray(block?.row))?.row || []
}

function officialResultCode(payload) {
  if (payload?.RESULT?.CODE) return String(payload.RESULT.CODE)
  const head = payload?.hisTimetable?.[0]?.head
  const result = Array.isArray(head) ? head.find((item) => item?.RESULT)?.RESULT : null
  return result?.CODE ? String(result.CODE) : ''
}

async function officialTimetableRequest(params, signal) {
  const url = new URL(`${NEIS_BASE}/hisTimetable`)
  url.searchParams.set('KEY', 'sample')
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', '5')
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`NEIS 시간표 요청 실패 (${response.status})`)
  const payload = await response.json()
  const code = officialResultCode(payload)
  if (code === 'INFO-200') return []
  if (code && code !== 'INFO-000') throw new Error(`NEIS 시간표 오류 (${code})`)
  return getOfficialRows(payload)
}

async function fetchMirrorRows(classNumber, week, signal) {
  const url = new URL(NEIS_MIRROR_URL)
  url.searchParams.set('eduCode', NEIS_TIMETABLE_SCHOOL.officeCode)
  url.searchParams.set('schoolCode', NEIS_TIMETABLE_SCHOOL.schoolCode)
  url.searchParams.set('grade', String(NEIS_TIMETABLE_SCHOOL.grade))
  url.searchParams.set('class', String(classNumber))
  url.searchParams.set('kind', 'his')
  url.searchParams.set('from', week.weekStart)
  url.searchParams.set('to', week.weekEnd)

  const response = await fetch(url.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`NEIS 미러 시간표 요청 실패 (${response.status})`)
  const payload = await response.json()
  if (payload?.ok !== true) throw new Error(payload?.error?.message || 'NEIS 미러 응답이 올바르지 않아.')
  if (String(payload?.meta?.source || '').toUpperCase() !== 'NEIS') {
    throw new Error('NEIS 출처를 확인하지 못했어.')
  }
  return Array.isArray(payload.data) ? payload.data : []
}

async function fetchOfficialRows(classNumber, week, signal) {
  const common = {
    ATPT_OFCDC_SC_CODE: NEIS_TIMETABLE_SCHOOL.officeCode,
    SD_SCHUL_CODE: NEIS_TIMETABLE_SCHOOL.schoolCode,
    GRADE: NEIS_TIMETABLE_SCHOOL.grade,
    CLASS_NM: classNumber,
  }
  const allRows = []

  for (let index = 0; index < 5; index += 1) {
    const date = new Date(week.monday)
    date.setDate(week.monday.getDate() + index)
    const ALL_TI_YMD = neisDateKey(date)
    const [firstFive, sixth, seventh] = await Promise.all([
      officialTimetableRequest({ ...common, ALL_TI_YMD }, signal),
      officialTimetableRequest({ ...common, ALL_TI_YMD, PERIO: 6 }, signal),
      officialTimetableRequest({ ...common, ALL_TI_YMD, PERIO: 7 }, signal),
    ])
    allRows.push(...firstFive, ...sixth, ...seventh)
  }
  return allRows
}

function normalizedRow(row, fallbackClassNumber) {
  const rawDate = String(row?.date ?? row?.ALL_TI_YMD ?? '')
  const period = Number(row?.period ?? row?.PERIO ?? 0)
  const subject = String(row?.subject ?? row?.ITRT_CNTNT ?? '').trim()
  if (!/^\d{8}$/.test(rawDate) || !Number.isInteger(period) || period < 1 || period > 7 || !subject) return null
  return {
    rawDate,
    grade: Number(row?.grade ?? row?.GRADE ?? 2),
    classNumber: Number(row?.class ?? row?.CLASS_NM ?? fallbackClassNumber),
    period,
    subject,
  }
}

function buildResult(allRows, classNumber, week, dataSource) {
  const deduped = new Map()
  allRows.forEach((row) => {
    const normalized = normalizedRow(row, classNumber)
    if (!normalized) return
    if (normalized.grade !== 2 || normalized.classNumber !== classNumber) return
    deduped.set(`${normalized.rawDate}:${normalized.period}`, normalized)
  })

  const rows = [...deduped.values()].sort((a, b) => a.rawDate.localeCompare(b.rawDate) || a.period - b.period)
  const rawSchedule = { mon: {}, tue: {}, wed: {}, thu: {}, fri: {} }
  rows.forEach((row) => {
    const year = Number(row.rawDate.slice(0, 4))
    const month = Number(row.rawDate.slice(4, 6))
    const day = Number(row.rawDate.slice(6, 8))
    const dayKey = DAY_KEYS[new Date(year, month - 1, day, 12, 0, 0, 0).getDay()]
    if (dayKey) rawSchedule[dayKey][row.period] = row.subject
  })

  const weeklySchedule = normalizeWeeklySchedule(rawSchedule)
  const subjectCount = Object.values(weeklySchedule)
    .flatMap((periods) => Object.values(periods))
    .filter((subject) => String(subject || '').trim()).length

  return {
    ...week,
    classNumber,
    rows,
    weeklySchedule,
    subjectCount,
    dataSource,
    available: rows.length > 0 && subjectCount > 0,
  }
}

export async function fetchGrade2ClassTimetable(classNumber, anchor = new Date(), signal) {
  const number = Number(classNumber)
  if (!Number.isInteger(number) || number < 1 || number > 30) throw new Error('반 번호가 올바르지 않아.')

  const week = neisTargetWeek(anchor)
  let mirrorError = null

  try {
    const mirrorRows = await fetchMirrorRows(number, week, signal)
    const mirrorResult = buildResult(mirrorRows, number, week, 'NEIS-mirror')
    if (mirrorResult.available) return mirrorResult
  } catch (error) {
    mirrorError = error
  }

  try {
    const officialRows = await fetchOfficialRows(number, week, signal)
    return buildResult(officialRows, number, week, 'NEIS-direct')
  } catch (error) {
    if (mirrorError) throw mirrorError
    throw error
  }
}
