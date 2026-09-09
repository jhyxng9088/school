import { normalizeWeeklySchedule } from './timetable.js'
import { LEGACY_SCHOOL_CONTEXT, timetableEndpointForSchoolKind } from './school-directory.js'

export const NEIS_TIMETABLE_SCHOOL = {
  officeCode: LEGACY_SCHOOL_CONTEXT.officeCode,
  schoolCode: LEGACY_SCHOOL_CONTEXT.schoolCode,
  schoolName: LEGACY_SCHOOL_CONTEXT.schoolName,
  schoolKind: LEGACY_SCHOOL_CONTEXT.schoolKind,
  grade: LEGACY_SCHOOL_CONTEXT.grade,
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

function normalizeSchoolContext(profile) {
  const officeCode = String(profile?.officeCode || '').trim()
  const schoolCode = String(profile?.schoolCode || '').trim()
  const schoolName = String(profile?.schoolName || '').trim()
  const schoolKind = String(profile?.schoolKind || '').trim()
  const grade = Number(profile?.grade)
  if (!officeCode || !schoolCode || !Number.isInteger(grade) || grade < 1 || grade > 6) {
    return { ...NEIS_TIMETABLE_SCHOOL }
  }
  return {
    officeCode,
    schoolCode,
    schoolName,
    schoolKind,
    grade,
  }
}

function getOfficialRows(payload, endpoint) {
  const section = payload?.[endpoint]
  if (!Array.isArray(section)) return []
  return section.find((block) => Array.isArray(block?.row))?.row || []
}

function officialResultCode(payload, endpoint) {
  if (payload?.RESULT?.CODE) return String(payload.RESULT.CODE)
  const head = payload?.[endpoint]?.[0]?.head
  const result = Array.isArray(head) ? head.find((item) => item?.RESULT)?.RESULT : null
  return result?.CODE ? String(result.CODE) : ''
}

async function officialTimetableRequest(endpoint, params, signal) {
  const url = new URL(`${NEIS_BASE}/${endpoint}`)
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
  const code = officialResultCode(payload, endpoint)
  if (code === 'INFO-200') return []
  if (code && code !== 'INFO-000') throw new Error(`NEIS 시간표 오류 (${code})`)
  return getOfficialRows(payload, endpoint)
}

async function fetchMirrorRows(context, classNumber, week, signal) {
  if (timetableEndpointForSchoolKind(context.schoolKind) !== 'hisTimetable') return []
  const url = new URL(NEIS_MIRROR_URL)
  url.searchParams.set('eduCode', context.officeCode)
  url.searchParams.set('schoolCode', context.schoolCode)
  url.searchParams.set('grade', String(context.grade))
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

async function fetchOfficialRows(context, classNumber, week, signal) {
  const endpoint = timetableEndpointForSchoolKind(context.schoolKind)
  const common = {
    ATPT_OFCDC_SC_CODE: context.officeCode,
    SD_SCHUL_CODE: context.schoolCode,
    GRADE: context.grade,
    CLASS_NM: classNumber,
  }
  const allRows = []

  for (let index = 0; index < 5; index += 1) {
    const date = new Date(week.monday)
    date.setDate(week.monday.getDate() + index)
    const ALL_TI_YMD = neisDateKey(date)
    const [firstFive, sixth, seventh] = await Promise.all([
      officialTimetableRequest(endpoint, { ...common, ALL_TI_YMD }, signal),
      officialTimetableRequest(endpoint, { ...common, ALL_TI_YMD, PERIO: 6 }, signal),
      officialTimetableRequest(endpoint, { ...common, ALL_TI_YMD, PERIO: 7 }, signal),
    ])
    allRows.push(...firstFive, ...sixth, ...seventh)
  }
  return allRows
}

function normalizedRow(row, fallbackClassNumber, fallbackGrade) {
  const rawDate = String(row?.date ?? row?.ALL_TI_YMD ?? '')
  const period = Number(row?.period ?? row?.PERIO ?? 0)
  const subject = String(row?.subject ?? row?.ITRT_CNTNT ?? '').trim()
  if (!/^\d{8}$/.test(rawDate) || !Number.isInteger(period) || period < 1 || period > 7 || !subject) return null
  return {
    rawDate,
    grade: Number(row?.grade ?? row?.GRADE ?? fallbackGrade),
    classNumber: Number(row?.class ?? row?.CLASS_NM ?? fallbackClassNumber),
    period,
    subject,
  }
}

function buildResult(allRows, context, classNumber, week, dataSource) {
  const deduped = new Map()
  allRows.forEach((row) => {
    const normalized = normalizedRow(row, classNumber, context.grade)
    if (!normalized) return
    if (normalized.grade !== context.grade || normalized.classNumber !== classNumber) return
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
    grade: context.grade,
    schoolCode: context.schoolCode,
    rows,
    weeklySchedule,
    subjectCount,
    dataSource,
    available: rows.length > 0 && subjectCount > 0,
  }
}

export async function fetchClassTimetable(profile, anchor = new Date(), signal) {
  const context = normalizeSchoolContext(profile)
  const classNumber = Number(profile?.classNumber)
  if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 30) throw new Error('반 번호가 올바르지 않아.')

  const week = neisTargetWeek(anchor)
  let mirrorError = null

  try {
    const mirrorRows = await fetchMirrorRows(context, classNumber, week, signal)
    const mirrorResult = buildResult(mirrorRows, context, classNumber, week, 'NEIS-mirror')
    if (mirrorResult.available) return mirrorResult
  } catch (error) {
    mirrorError = error
  }

  try {
    const officialRows = await fetchOfficialRows(context, classNumber, week, signal)
    return buildResult(officialRows, context, classNumber, week, 'NEIS-direct')
  } catch (error) {
    if (mirrorError) throw mirrorError
    throw error
  }
}

export async function fetchGrade2ClassTimetable(classNumber, anchor = new Date(), signal) {
  return fetchClassTimetable({
    ...NEIS_TIMETABLE_SCHOOL,
    classNumber,
  }, anchor, signal)
}
