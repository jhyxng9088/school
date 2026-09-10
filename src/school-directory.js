const NEIS_BASE = 'https://open.neis.go.kr/hub'
const SCHOOL_MIRROR_URL = 'https://kschoolinfo.com/api/v1/schools'

export const LEGACY_SCHOOL_CONTEXT = Object.freeze({
  officeCode: 'J10',
  schoolCode: '7530093',
  schoolName: '수지고등학교',
  schoolKind: '고등학교',
  regionName: '경기도',
  grade: 2,
})

function rowsFromPayload(payload) {
  const section = payload?.schoolInfo
  if (!Array.isArray(section)) return []
  return section.find((block) => Array.isArray(block?.row))?.row || []
}

function resultCode(payload) {
  if (payload?.RESULT?.CODE) return String(payload.RESULT.CODE)
  const head = payload?.schoolInfo?.[0]?.head
  const result = Array.isArray(head) ? head.find((item) => item?.RESULT)?.RESULT : null
  return result?.CODE ? String(result.CODE) : ''
}

function firstText(...values) {
  for (const value of values) {
    const candidate = value && typeof value === 'object'
      ? (value.name ?? value.label ?? value.value ?? value.code)
      : value
    const text = String(candidate ?? '').trim()
    if (text) return text
  }
  return ''
}

export function normalizeSchoolResult(row) {
  if (!row || typeof row !== 'object') return null
  const officeCode = firstText(row.ATPT_OFCDC_SC_CODE, row.eduCode, row.officeCode, row.educationOfficeCode)
  const schoolCode = firstText(row.SD_SCHUL_CODE, row.schoolCode)
  const schoolName = firstText(row.SCHUL_NM, row.name, row.schoolName)
  const schoolKind = firstText(row.SCHUL_KND_SC_NM, row.kind, row.schoolKind)
  if (!officeCode || !schoolCode || !schoolName) return null
  return {
    officeCode,
    schoolCode,
    schoolName,
    schoolKind,
    officeName: firstText(row.ATPT_OFCDC_SC_NM, row.eduName, row.officeName, row.educationOfficeName),
    regionName: firstText(row.LCTN_SC_NM, row.region, row.regionName),
    address: firstText(row.ORG_RDNMA, row.address, row.roadAddress),
  }
}

function dedupeSchools(rows) {
  const deduped = new Map()
  rows.map(normalizeSchoolResult).filter(Boolean).forEach((school) => {
    deduped.set(`${school.officeCode}:${school.schoolCode}`, school)
  })
  return [...deduped.values()]
}

async function searchSchoolMirror(term, signal, fetchImpl) {
  const url = new URL(SCHOOL_MIRROR_URL)
  url.searchParams.set('name', term)
  url.searchParams.set('page', '1')
  url.searchParams.set('size', '10')

  const response = await fetchImpl(url.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`학교 검색 미러 요청 실패 (${response.status})`)
  const payload = await response.json()
  if (payload?.ok !== true) throw new Error(payload?.error?.message || '학교 검색 미러 응답이 올바르지 않아.')
  return dedupeSchools(Array.isArray(payload.data) ? payload.data : [])
}

async function searchSchoolOfficial(term, signal, fetchImpl) {
  const url = new URL(`${NEIS_BASE}/schoolInfo`)
  url.searchParams.set('KEY', 'sample')
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pIndex', '1')
  url.searchParams.set('pSize', '5')
  url.searchParams.set('SCHUL_NM', term)

  const response = await fetchImpl(url.toString(), { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`학교 검색 요청 실패 (${response.status})`)
  const payload = await response.json()
  const code = resultCode(payload)
  if (code === 'INFO-200') return []
  if (code && code !== 'INFO-000') throw new Error(payload?.RESULT?.MESSAGE || `학교 검색 오류 (${code})`)
  return dedupeSchools(rowsFromPayload(payload))
}

export function maxGradeForSchoolKind(kind) {
  const value = String(kind || '')
  if (/초등/.test(value)) return 6
  if (/중학|고등|특수/.test(value)) return 3
  return 3
}

export function timetableEndpointForSchoolKind(kind) {
  const value = String(kind || '')
  if (/초등/.test(value)) return 'elsTimetable'
  if (/중학/.test(value)) return 'misTimetable'
  if (/특수/.test(value)) return 'spsTimetable'
  return 'hisTimetable'
}

export function schoolScopeKey(profile) {
  const officeCode = String(profile?.officeCode || '').trim()
  const schoolCode = String(profile?.schoolCode || '').trim()
  const grade = Number(profile?.grade)
  if (!officeCode || !schoolCode || !Number.isInteger(grade)) return ''
  return `${officeCode}:${schoolCode}:g${grade}`
}

export function isLegacySchoolScope(profile) {
  return String(profile?.officeCode || '') === LEGACY_SCHOOL_CONTEXT.officeCode
    && String(profile?.schoolCode || '') === LEGACY_SCHOOL_CONTEXT.schoolCode
    && Number(profile?.grade) === LEGACY_SCHOOL_CONTEXT.grade
}

export async function searchNeisSchools(query, signal, fetchImpl = globalThis.fetch) {
  const term = String(query || '').normalize('NFKC').trim()
  if (term.length < 2) return []
  if (typeof fetchImpl !== 'function') throw new Error('학교 검색을 사용할 수 없어.')

  let mirrorError = null
  let mirrorSucceeded = false
  try {
    const mirrored = await searchSchoolMirror(term, signal, fetchImpl)
    mirrorSucceeded = true
    if (mirrored.length) return mirrored
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    mirrorError = error
  }

  try {
    return await searchSchoolOfficial(term, signal, fetchImpl)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (mirrorSucceeded) return []
    throw mirrorError || error
  }
}
