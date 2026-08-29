const NEIS_BASE = 'https://open.neis.go.kr/hub'
const OFFICE_CODE = 'J10'
const SCHOOL_NAME = '수지고등학교'
const GRADE = 2
const NEIS_API_KEY = String(process.env.NEIS_API_KEY || '').trim()

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function ymd(date) {
  const value = date instanceof Date ? date : new Date(date)
  return `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}`
}

export function isoDate(value) {
  const text = String(value || '')
  return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : ''
}

export function weekRange(base = new Date()) {
  const date = new Date(base)
  date.setHours(12, 0, 0, 0)
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setDate(date.getDate() + mondayOffset)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return { monday, friday }
}

function datesBetween(fromDate, toDate) {
  const start = new Date(fromDate)
  const end = new Date(toDate)
  start.setHours(12, 0, 0, 0)
  end.setHours(12, 0, 0, 0)
  const dates = []
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(new Date(cursor))
  }
  return dates
}

async function neisJson(path, params, options = {}) {
  const url = new URL(`${NEIS_BASE}/${path}`)
  url.searchParams.set('KEY', NEIS_API_KEY || 'sample')
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', String(options.pSize || (NEIS_API_KEY ? 1000 : 5)))
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value))
  }
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`neis_http_${response.status}`)
  const data = await response.json()
  const topResult = data?.RESULT
  if (topResult?.CODE && topResult.CODE !== 'INFO-000') {
    if (topResult.CODE === 'INFO-200') return []
    throw new Error(`neis_${topResult.CODE}`)
  }
  const head = data?.[path]?.[0]?.head
  const result = Array.isArray(head) ? head.find((item) => item?.RESULT)?.RESULT : null
  if (result && result.CODE && result.CODE !== 'INFO-000') {
    if (result.CODE === 'INFO-200') return []
    throw new Error(`neis_${result.CODE}`)
  }
  return data?.[path]?.[1]?.row || []
}

let cachedSchool = null
export async function getSujiHighSchool() {
  if (cachedSchool) return cachedSchool
  const rows = await neisJson('schoolInfo', {
    ATPT_OFCDC_SC_CODE: OFFICE_CODE,
    SCHUL_NM: SCHOOL_NAME,
  }, { pSize: NEIS_API_KEY ? 100 : 5 })
  const exact = rows.find((row) => String(row.SCHUL_NM || '').trim() === SCHOOL_NAME)
  if (!exact?.SD_SCHUL_CODE) throw new Error('suji_high_school_not_found')
  cachedSchool = {
    officeCode: String(exact.ATPT_OFCDC_SC_CODE || OFFICE_CODE),
    schoolCode: String(exact.SD_SCHUL_CODE),
    schoolName: String(exact.SCHUL_NM || SCHOOL_NAME),
    address: String(exact.ORG_RDNMA || ''),
  }
  return cachedSchool
}

function normalizeTimetableRows(rows, classNumber) {
  return (rows || []).map((row) => ({
    date: isoDate(row.ALL_TI_YMD),
    grade: Number(row.GRADE || GRADE),
    classNumber: Number(row.CLASS_NM || classNumber),
    period: Number(row.PERIO || 0),
    subject: String(row.ITRT_CNTNT || '').trim(),
  })).filter((row) => row.date && row.period > 0)
}

export async function getClassTimetable(classNumber, fromDate, toDate) {
  const number = Number(classNumber)
  if (!Number.isInteger(number) || number < 1 || number > 30) throw new Error('invalid_class_number')
  const school = await getSujiHighSchool()
  const common = {
    ATPT_OFCDC_SC_CODE: school.officeCode,
    SD_SCHUL_CODE: school.schoolCode,
    GRADE,
    CLASS_NM: number,
  }

  if (NEIS_API_KEY) {
    const rows = await neisJson('hisTimetable', {
      ...common,
      TI_FROM_YMD: ymd(fromDate),
      TI_TO_YMD: ymd(toDate),
    })
    return normalizeTimetableRows(rows, number)
  }

  const collected = []
  for (const date of datesBetween(fromDate, toDate)) {
    const day = date.getDay()
    if (day === 0 || day === 6) continue
    const dateValue = ymd(date)
    const firstFive = await neisJson('hisTimetable', {
      ...common,
      ALL_TI_YMD: dateValue,
    }, { pSize: 5 })
    collected.push(...firstFive)

    for (const period of [6, 7]) {
      const extra = await neisJson('hisTimetable', {
        ...common,
        ALL_TI_YMD: dateValue,
        PERIO: period,
      }, { pSize: 5 })
      collected.push(...extra)
    }
  }

  const deduped = new Map()
  for (const row of normalizeTimetableRows(collected, number)) {
    deduped.set(`${row.date}:${row.period}`, row)
  }
  return [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period)
}

export function weeklyScheduleFromRows(rows) {
  const dayKey = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }
  const weeklySchedule = { mon: {}, tue: {}, wed: {}, thu: {}, fri: {} }
  for (const row of rows || []) {
    const date = new Date(`${row.date}T12:00:00+09:00`)
    const key = dayKey[date.getDay()]
    if (!key || !Number.isInteger(row.period) || row.period < 1 || row.period > 7) continue
    weeklySchedule[key][row.period] = String(row.subject || '').trim()
  }
  return weeklySchedule
}

export const NEIS_TIMETABLE_META = {
  officeCode: OFFICE_CODE,
  schoolName: SCHOOL_NAME,
  grade: GRADE,
  keyed: Boolean(NEIS_API_KEY),
}
