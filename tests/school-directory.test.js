import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_SCHOOL_CONTEXT,
  isLegacySchoolScope,
  maxGradeForSchoolKind,
  normalizeSchoolResult,
  schoolScopeKey,
  searchNeisSchools,
  timetableEndpointForSchoolKind,
} from '../src/school-directory.js'

test('schoolInfo rows normalize into stable NEIS identifiers', () => {
  const school = normalizeSchoolResult({
    ATPT_OFCDC_SC_CODE: 'J10',
    SD_SCHUL_CODE: '7530093',
    SCHUL_NM: '수지고등학교',
    SCHUL_KND_SC_NM: '고등학교',
    ATPT_OFCDC_SC_NM: '경기도교육청',
    LCTN_SC_NM: '경기도',
    ORG_RDNMA: '경기도 용인시 수지구',
  })
  assert.deepEqual(school, {
    officeCode: 'J10',
    schoolCode: '7530093',
    schoolName: '수지고등학교',
    schoolKind: '고등학교',
    officeName: '경기도교육청',
    regionName: '경기도',
    address: '경기도 용인시 수지구',
  })
})

test('mirror school rows normalize into the same stored school contract', () => {
  const school = normalizeSchoolResult({
    eduCode: 'J10',
    schoolCode: '7530093',
    name: '수지고등학교',
    kind: '고등학교',
    eduName: '경기도교육청',
    region: '경기도',
    address: '경기도 용인시 수지구',
  })
  assert.deepEqual(school, {
    officeCode: 'J10',
    schoolCode: '7530093',
    schoolName: '수지고등학교',
    schoolKind: '고등학교',
    officeName: '경기도교육청',
    regionName: '경기도',
    address: '경기도 용인시 수지구',
  })
})

test('school kind controls grade range and timetable endpoint', () => {
  assert.equal(maxGradeForSchoolKind('초등학교'), 6)
  assert.equal(maxGradeForSchoolKind('중학교'), 3)
  assert.equal(maxGradeForSchoolKind('고등학교'), 3)
  assert.equal(timetableEndpointForSchoolKind('초등학교'), 'elsTimetable')
  assert.equal(timetableEndpointForSchoolKind('중학교'), 'misTimetable')
  assert.equal(timetableEndpointForSchoolKind('고등학교'), 'hisTimetable')
})

test('legacy Suji grade 2 scope remains identifiable for data compatibility', () => {
  assert.equal(isLegacySchoolScope(LEGACY_SCHOOL_CONTEXT), true)
  assert.equal(schoolScopeKey(LEGACY_SCHOOL_CONTEXT), 'J10:7530093:g2')
  assert.equal(isLegacySchoolScope({ ...LEGACY_SCHOOL_CONTEXT, grade: 1 }), false)
})

test('school search uses the CORS-safe NEIS mirror first and deduplicates results', async () => {
  const calls = []
  const fakeFetch = async (input) => {
    calls.push(new URL(String(input)))
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          data: [
            { eduCode: 'J10', schoolCode: '7530093', name: '수지고등학교', kind: '고등학교' },
            { eduCode: 'J10', schoolCode: '7530093', name: '수지고등학교', kind: '고등학교' },
          ],
          meta: { source: 'NEIS' },
        }
      },
    }
  }

  const results = await searchNeisSchools('수지고', undefined, fakeFetch)
  assert.equal(results.length, 1)
  assert.equal(results[0].schoolCode, '7530093')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].hostname, 'kschoolinfo.com')
  assert.equal(calls[0].pathname, '/api/v1/schools')
  assert.equal(calls[0].searchParams.get('name'), '수지고')
})

test('school search falls back to official NEIS when the mirror is unavailable', async () => {
  const calls = []
  const fakeFetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    if (url.hostname === 'kschoolinfo.com') {
      return { ok: false, status: 503, async json() { return {} } }
    }
    return {
      ok: true,
      async json() {
        return {
          schoolInfo: [
            { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다.' } }] },
            { row: [{
              ATPT_OFCDC_SC_CODE: 'J10',
              SD_SCHUL_CODE: '7530093',
              SCHUL_NM: '수지고등학교',
              SCHUL_KND_SC_NM: '고등학교',
            }] },
          ],
        }
      },
    }
  }

  const results = await searchNeisSchools('수지고', undefined, fakeFetch)
  assert.equal(results.length, 1)
  assert.equal(results[0].schoolName, '수지고등학교')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].hostname, 'open.neis.go.kr')
  assert.equal(calls[1].pathname, '/hub/schoolInfo')
  assert.equal(calls[1].searchParams.get('SCHUL_NM'), '수지고')
})
