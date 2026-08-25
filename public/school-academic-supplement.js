(() => {
  const CACHE_KEY = 'school.stage3.academic.v3'
  const SCHOOL_CODE = '7530093'
  const OFFICE_CODE = 'J10'
  const mockExams = [
    { rawDate: '20260324', name: '3월 전국연합학력평가', content: '고2 · 서울특별시교육청 주관' },
    { rawDate: '20260604', name: '6월 전국연합학력평가', content: '고2 · 부산광역시교육청 주관' },
    { rawDate: '20260902', name: '9월 전국연합학력평가', content: '고2 · 인천광역시교육청 주관' },
    { rawDate: '20261020', name: '10월 전국연합학력평가', content: '고2 · 경기도교육청 주관' },
  ]

  function isMockName(value) {
    return /전국연합|학력평가|모의고사/.test(String(value || ''))
  }

  function inRange(rawDate, from, to) {
    return (!from || rawDate >= from) && (!to || rawDate <= to)
  }

  function addMissingToNormalized(events, from, to) {
    const next = Array.isArray(events) ? [...events] : []
    for (const exam of mockExams) {
      if (!inRange(exam.rawDate, from, to)) continue
      const duplicate = next.some((event) =>
        String(event?.rawDate || '') === exam.rawDate && isMockName(event?.name),
      )
      if (duplicate) continue
      next.push({
        rawDate: exam.rawDate,
        name: exam.name,
        content: exam.content,
        dayOffType: '해당없음',
        relevantToSecondGrade: true,
      })
    }
    next.sort((a, b) => String(a.rawDate || '').localeCompare(String(b.rawDate || '')) || String(a.name || '').localeCompare(String(b.name || '')))
    return next
  }

  function seedAcademicCache() {
    try {
      const store = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (!store?.ranges || typeof store.ranges !== 'object') return
      let changed = false
      for (const [key, entry] of Object.entries(store.ranges)) {
        const [from, to] = key.split('-')
        if (!entry || !Array.isArray(entry.events)) continue
        const nextEvents = addMissingToNormalized(entry.events, from, to)
        if (nextEvents.length !== entry.events.length) {
          entry.events = nextEvents
          changed = true
        }
      }
      if (changed) localStorage.setItem(CACHE_KEY, JSON.stringify(store))
    } catch {
      // Ignore malformed or unavailable local storage.
    }
  }

  function addMissingToNeisPayload(payload, requestUrl) {
    try {
      const url = new URL(requestUrl, location.href)
      const from = url.searchParams.get('AA_FROM_YMD') || ''
      const to = url.searchParams.get('AA_TO_YMD') || ''
      const additions = mockExams.filter((exam) => inRange(exam.rawDate, from, to))
      if (!additions.length) return payload

      if (!Array.isArray(payload.SchoolSchedule)) payload.SchoolSchedule = []
      let rowBlock = payload.SchoolSchedule.find((block) => Array.isArray(block?.row))
      if (!rowBlock) {
        rowBlock = { row: [] }
        payload.SchoolSchedule.push(rowBlock)
      }

      for (const exam of additions) {
        const duplicate = rowBlock.row.some((row) =>
          String(row?.AA_YMD || '') === exam.rawDate && isMockName(row?.EVENT_NM),
        )
        if (duplicate) continue
        rowBlock.row.push({
          ATPT_OFCDC_SC_CODE: OFFICE_CODE,
          SD_SCHUL_CODE: SCHOOL_CODE,
          AA_YMD: exam.rawDate,
          EVENT_NM: exam.name,
          EVENT_CNTNT: exam.content,
          ONE_GRADE_EVENT_YN: 'N',
          TW_GRADE_EVENT_YN: 'Y',
          THREE_GRADE_EVENT_YN: 'N',
          SBTR_DD_SC_NM: '해당없음',
        })
      }
      return payload
    } catch {
      return payload
    }
  }

  seedAcademicCache()

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
    if (!requestUrl.includes('open.neis.go.kr/hub/SchoolSchedule') || !response.ok) return response

    try {
      const payload = await response.clone().json()
      const patched = addMissingToNeisPayload(payload, requestUrl)
      const headers = new Headers(response.headers)
      headers.set('content-type', 'application/json; charset=utf-8')
      headers.delete('content-length')
      return new Response(JSON.stringify(patched), {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch {
      return response
    }
  }
})()
