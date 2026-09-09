const NEIS_BASE = 'https://open.neis.go.kr/hub'

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

export function normalizeSchoolResult(row) {
  if (!row || typeof row !== 'object') return null
  const officeCode = String(row.ATPT_OFCDC_SC_CODE || '').trim()
  const schoolCode = String(row.SD_SCHUL_CODE || '').trim()
  const schoolName = String(row.SCHUL_NM || '').trim()
  const schoolKind = String(row.SCHUL_KND_SC_NM || '').trim()
  if (!officeCode || !schoolCode || !schoolName) return null
  return {
    officeCode,
    schoolCode,
    schoolName,
    schoolKind,
    officeName: String(row.ATPT_OFCDC_SC_NM || '').trim(),
    regionName: String(row.LCTN_SC_NM || '').trim(),
    address: String(row.ORG_RDNMA || '').trim(),
  }
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

  const deduped = new Map()
  rowsFromPayload(payload).map(normalizeSchoolResult).filter(Boolean).forEach((school) => {
    deduped.set(`${school.officeCode}:${school.schoolCode}`, school)
  })
  return [...deduped.values()]
}
