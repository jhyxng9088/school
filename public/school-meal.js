(() => {
  const SCHOOL = {
    officeCode: 'J10',
    schoolCode: '7530093',
    schoolName: '수지고등학교',
  }
  const CACHE_KEY = 'school.meals.suji.v2'
  const CACHE_MAX_AGE = 1000 * 60 * 60 * 12
  const SOFT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
  const OUT_EASE = 'cubic-bezier(0.4, 0, 1, 1)'
  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  const state = {
    ranges: {},
    loadingRanges: new Set(),
    errors: {},
    selectedDate: null,
    weekOffset: 0,
    renderFrame: null,
    transitionBusy: false,
    pendingDataMotion: false,
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

  function getWeekDates(anchor = new Date()) {
    const start = new Date(anchor)
    start.setHours(12, 0, 0, 0)
    const jsDay = start.getDay()
    start.setDate(start.getDate() + (jsDay === 0 ? -6 : 1 - jsDay))
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }

  function anchorForWeekOffset(offset) {
    const anchor = new Date()
    anchor.setDate(anchor.getDate() + offset * 7)
    return anchor
  }

  function viewedWeekDates() {
    return getWeekDates(anchorForWeekOffset(state.weekOffset))
  }

  function currentWeekDates() {
    return getWeekDates(new Date())
  }

  function weekRangeKey(dates) {
    return `${rawDate(dates[0])}-${rawDate(dates[dates.length - 1])}`
  }

  function formatWeekRange(dates) {
    const first = dates[0]
    const last = dates[dates.length - 1]
    if (first.getMonth() === last.getMonth()) {
      return `${first.getMonth() + 1}월 ${first.getDate()}–${last.getDate()}일`
    }
    return `${first.getMonth() + 1}월 ${first.getDate()}일–${last.getMonth() + 1}월 ${last.getDate()}일`
  }

  function relativeWeekLabel(offset) {
    if (offset === 0) return '이번 주'
    if (offset === 1) return '다음 주'
    if (offset === -1) return '지난 주'
    if (offset > 1) return `${offset}주 후`
    return `${Math.abs(offset)}주 전`
  }

  function formatSelectedDate(date) {
    if (!date) return ''
    return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_LABELS[date.getDay()]}요일`
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function cleanDish(raw) {
    return String(raw || '')
      .replace(/\s*\([0-9.]+\)\s*$/g, '')
      .replace(/\s*\(S\)\s*$/gi, '')
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

  function rowsFromPayload(payload) {
    const section = payload?.mealServiceDietInfo
    if (!Array.isArray(section)) return []
    return section.find((block) => Array.isArray(block?.row))?.row || []
  }

  function readCacheStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      return parsed && typeof parsed === 'object' && parsed.ranges ? parsed : { ranges: {} }
    } catch {
      return { ranges: {} }
    }
  }

  function loadCachedRange(rangeKey) {
    if (state.ranges[rangeKey]) return state.ranges[rangeKey]
    const store = readCacheStore()
    const cached = store.ranges?.[rangeKey]
    if (!cached || !Array.isArray(cached.meals)) return null

    const value = {
      meals: cached.meals,
      savedAt: Number(cached.savedAt || 0),
      stale: Date.now() - Number(cached.savedAt || 0) > CACHE_MAX_AGE,
    }
    state.ranges[rangeKey] = value
    return value
  }

  function saveCachedRange(rangeKey, meals) {
    const savedAt = Date.now()
    state.ranges[rangeKey] = { meals, savedAt, stale: false }

    try {
      const store = readCacheStore()
      store.ranges = store.ranges || {}
      store.ranges[rangeKey] = {
        savedAt,
        schoolCode: SCHOOL.schoolCode,
        meals,
      }

      const keys = Object.keys(store.ranges).sort().slice(-10)
      store.ranges = Object.fromEntries(keys.map((key) => [key, store.ranges[key]]))
      localStorage.setItem(CACHE_KEY, JSON.stringify(store))
    } catch {
      // The current session still keeps the meals in memory.
    }
  }

  function mealForRawDate(value) {
    for (const range of Object.values(state.ranges)) {
      const sameDay = (range.meals || []).filter((meal) => meal.rawDate === value)
      const meal = sameDay.find((item) => item.mealCode === '2') || sameDay[0]
      if (meal) return meal
    }
    return null
  }

  async function fetchWeek(dates, force = false, { renderStart = true } = {}) {
    const rangeKey = weekRangeKey(dates)
    const cached = loadCachedRange(rangeKey)

    if (!force && cached && !cached.stale) return cached.meals
    if (state.loadingRanges.has(rangeKey)) return cached?.meals || []

    state.loadingRanges.add(rangeKey)
    state.errors[rangeKey] = null
    if (renderStart) scheduleRender()

    try {
      const url = new URL('https://open.neis.go.kr/hub/mealServiceDietInfo')
      url.searchParams.set('Type', 'json')
      url.searchParams.set('pIndex', '1')
      url.searchParams.set('pSize', '20')
      url.searchParams.set('ATPT_OFCDC_SC_CODE', SCHOOL.officeCode)
      url.searchParams.set('SD_SCHUL_CODE', SCHOOL.schoolCode)
      url.searchParams.set('MLSV_FROM_YMD', rawDate(dates[0]))
      url.searchParams.set('MLSV_TO_YMD', rawDate(dates[dates.length - 1]))

      const response = await fetch(url.toString(), { cache: 'no-store' })
      if (!response.ok) throw new Error(`NEIS ${response.status}`)
      const payload = await response.json()
      const rows = rowsFromPayload(payload)
      const meals = rows
        .map(normalizeMeal)
        .filter((meal) => meal.rawDate && meal.dishes.length)
        .sort((a, b) => `${a.rawDate}-${a.mealCode}`.localeCompare(`${b.rawDate}-${b.mealCode}`))

      saveCachedRange(rangeKey, meals)
      state.pendingDataMotion = true
      return meals
    } catch (error) {
      state.errors[rangeKey] = error
      return cached?.meals || []
    } finally {
      state.loadingRanges.delete(rangeKey)
      scheduleRender()
    }
  }

  function ensureHomeMount(section) {
    const oldEmpty = section.querySelector('.meal-empty')
    const oldNote = section.querySelector('.section-note')
    if (oldEmpty) oldEmpty.style.display = 'none'
    if (oldNote) oldNote.style.display = 'none'

    let mount = section.querySelector('.school-meal-home-mount')
    if (!mount) {
      mount = document.createElement('div')
      mount.className = 'school-meal-home-mount'
      section.appendChild(mount)
    }
    return mount
  }

  function renderHome() {
    const section = document.querySelector('.meal-preview')
    if (!section) return

    const dates = currentWeekDates()
    const rangeKey = weekRangeKey(dates)
    loadCachedRange(rangeKey)
    const mount = ensureHomeMount(section)
    const todayRaw = rawDate(new Date())
    const meal = mealForRawDate(todayRaw)
    const loading = state.loadingRanges.has(rangeKey)
    const error = state.errors[rangeKey]

    if (!meal && loading && !state.ranges[rangeKey]?.meals?.length) {
      mount.innerHTML = '<p class="school-meal-home-loading">급식 불러오는 중…</p>'
      return
    }

    if (!meal) {
      mount.innerHTML = `<p class="school-meal-home-empty">${error && !state.ranges[rangeKey]?.meals?.length ? '급식 정보를 불러오지 못했어.' : '오늘은 등록된 급식이 없어.'}</p>`
      return
    }

    const visible = meal.dishes.slice(0, 5)
    const rest = Math.max(0, meal.dishes.length - visible.length)
    const menu = visible.map(escapeHtml).join(' · ')
    const meta = [rest ? `외 ${rest}개` : '', meal.calories].filter(Boolean).join(' · ')
    mount.innerHTML = `
      <div class="school-meal-home-summary">
        <p class="school-meal-home-menu">${menu}</p>
        ${meta ? `<span class="school-meal-home-meta">${escapeHtml(meta)}</span>` : ''}
      </div>
    `
  }

  function mealPageHost() {
    const headers = Array.from(document.querySelectorAll('.page-header h1'))
    const title = headers.find((node) => node.textContent.trim() === '급식')
    if (!title) return null
    return title.closest('.app-content') || title.parentElement?.parentElement || null
  }

  function ensureMealPage(host) {
    if (!host) return null
    const empty = host.querySelector('.empty-panel')
    if (empty) empty.style.display = 'none'
    const eyebrow = host.querySelector('.page-header .date-label')
    if (eyebrow && eyebrow.textContent.trim() !== SCHOOL.schoolName) eyebrow.textContent = SCHOOL.schoolName

    let mount = host.querySelector('.school-meal-page')
    if (!mount) {
      mount = document.createElement('section')
      mount.className = 'school-meal-page'
      host.appendChild(mount)
    }
    return mount
  }

  function selectedDateForWeek(dates) {
    const selected = dateFromRaw(state.selectedDate)
    const selectedRaw = selected ? rawDate(selected) : ''
    const exact = dates.find((date) => rawDate(date) === selectedRaw)
    if (exact) return exact

    const today = new Date()
    if (state.weekOffset === 0 && today.getDay() >= 1 && today.getDay() <= 5) return today

    const desiredIndex = selected && selected.getDay() >= 1 && selected.getDay() <= 5
      ? selected.getDay() - 1
      : 0
    return dates[Math.min(4, Math.max(0, desiredIndex))]
  }

  function renderMealPage() {
    const host = mealPageHost()
    if (!host) return
    const mount = ensureMealPage(host)
    if (!mount) return

    const dates = viewedWeekDates()
    const rangeKey = weekRangeKey(dates)
    const cached = loadCachedRange(rangeKey)
    const todayRaw = rawDate(new Date())
    const selected = selectedDateForWeek(dates)
    const selectedRaw = rawDate(selected)
    state.selectedDate = selectedRaw

    const meals = cached?.meals || []
    const sameDay = meals.filter((meal) => meal.rawDate === selectedRaw)
    const meal = sameDay.find((item) => item.mealCode === '2') || sameDay[0] || null
    const loading = state.loadingRanges.has(rangeKey)
    const error = state.errors[rangeKey]

    const dayButtons = dates.map((date) => {
      const value = rawDate(date)
      const classes = [
        'school-meal-day',
        value === todayRaw ? 'is-today' : '',
        value === selectedRaw ? 'is-selected' : '',
      ].filter(Boolean).join(' ')
      return `
        <button class="${classes}" data-school-meal-date="${value}">
          <strong>${WEEKDAY_LABELS[date.getDay()]}</strong>
          <span>${date.getMonth() + 1}/${date.getDate()}</span>
        </button>
      `
    }).join('')

    let detail = ''
    if (!meal && loading && !meals.length) {
      detail = `
        <div class="school-meal-status">
          <strong>급식 불러오는 중</strong>
          <p>${escapeHtml(formatWeekRange(dates))} 수지고 급식을 확인하고 있어.</p>
        </div>
      `
    } else if (!meal && error && !meals.length) {
      detail = `
        <div class="school-meal-status">
          <strong>급식을 불러오지 못했어</strong>
          <p>인터넷 연결이나 NEIS 응답을 확인한 뒤 다시 시도해줘.</p>
          <button class="school-meal-retry" data-school-meal-retry>다시 불러오기</button>
        </div>
      `
    } else if (!meal) {
      detail = `
        <div class="school-meal-status">
          <strong>등록된 급식이 없어</strong>
          <p>${escapeHtml(formatSelectedDate(selected))}에는 NEIS에 등록된 급식이 없어.</p>
        </div>
      `
    } else {
      detail = `
        <p class="school-meal-date">${escapeHtml(formatSelectedDate(selected))} · ${escapeHtml(meal.mealName)}</p>
        <h2>급식</h2>
        <ul class="school-meal-dishes">
          ${meal.dishes.map((dish) => `<li>${escapeHtml(dish)}</li>`).join('')}
        </ul>
        ${meal.calories ? `<p class="school-meal-calories">${escapeHtml(meal.calories)}</p>` : ''}
      `
    }

    mount.innerHTML = `
      <div class="school-meal-week-nav">
        <button class="school-meal-week-arrow" data-school-meal-week="-1" aria-label="이전 주">‹</button>
        <button class="school-meal-week-title ${state.weekOffset === 0 ? 'is-current-week' : ''}" data-school-meal-current-week ${state.weekOffset === 0 ? 'disabled' : ''}>
          <strong>${escapeHtml(relativeWeekLabel(state.weekOffset))}</strong>
          <span>${escapeHtml(formatWeekRange(dates))}</span>
        </button>
        <button class="school-meal-week-arrow" data-school-meal-week="1" aria-label="다음 주">›</button>
      </div>
      <div class="school-meal-week-body" data-school-meal-week-body>
        <div class="school-meal-days">${dayButtons}</div>
        <section class="school-meal-detail" data-school-meal-detail>${detail}</section>
        ${cached?.stale ? '<p class="school-meal-cache-note">마지막으로 저장된 급식 정보를 표시하고 있어.</p>' : ''}
      </div>
    `
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function play(element, keyframes, options) {
    if (!element || reducedMotion()) return Promise.resolve()
    const animation = element.animate(keyframes, options)
    return animation.finished.catch(() => {})
  }

  async function switchDay(nextDate) {
    if (!nextDate || nextDate === state.selectedDate || state.transitionBusy) return
    state.transitionBusy = true

    const current = dateFromRaw(state.selectedDate)
    const next = dateFromRaw(nextDate)
    const direction = current && next && next > current ? 1 : -1
    const oldDetail = document.querySelector('[data-school-meal-detail]')

    await play(
      oldDetail,
      [
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0.35, transform: `translate3d(${-direction * 7}px, 0, 0)` },
      ],
      { duration: 240, easing: OUT_EASE, fill: 'both' },
    )

    state.selectedDate = nextDate
    renderMealPage()

    const newDetail = document.querySelector('[data-school-meal-detail]')
    await play(
      newDetail,
      [
        { opacity: 0.38, transform: `translate3d(${direction * 9}px, 0, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 680, easing: SOFT_EASE },
    )

    state.transitionBusy = false
  }

  async function navigateWeek(delta) {
    if (!delta || state.transitionBusy) return
    state.transitionBusy = true
    const direction = delta > 0 ? 1 : -1
    const oldBody = document.querySelector('[data-school-meal-week-body]')
    const oldSelected = dateFromRaw(state.selectedDate)
    const oldDayIndex = oldSelected && oldSelected.getDay() >= 1 && oldSelected.getDay() <= 5
      ? oldSelected.getDay() - 1
      : 0

    await play(
      oldBody,
      [
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0.28, transform: `translate3d(${-direction * 12}px, 0, 0)` },
      ],
      { duration: 260, easing: OUT_EASE, fill: 'both' },
    )

    state.weekOffset += delta
    const dates = viewedWeekDates()
    state.selectedDate = rawDate(dates[oldDayIndex] || dates[0])

    const fetchPromise = fetchWeek(dates, false, { renderStart: false })
    renderMealPage()

    const newBody = document.querySelector('[data-school-meal-week-body]')
    await play(
      newBody,
      [
        { opacity: 0.32, transform: `translate3d(${direction * 14}px, 0, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 760, easing: SOFT_EASE },
    )

    state.transitionBusy = false
    await fetchPromise
  }

  async function returnToCurrentWeek() {
    if (state.weekOffset === 0 || state.transitionBusy) return
    await navigateWeek(-state.weekOffset)
  }

  function animateDataRefresh() {
    if (!state.pendingDataMotion) return
    state.pendingDataMotion = false
    const detail = document.querySelector('[data-school-meal-detail]')
    play(
      detail,
      [
        { opacity: 0.66, transform: 'translate3d(0, 3px, 0)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 620, easing: SOFT_EASE },
    )
  }

  function renderAll() {
    renderHome()
    renderMealPage()
    animateDataRefresh()
  }

  function scheduleRender() {
    if (state.renderFrame !== null) return
    state.renderFrame = requestAnimationFrame(() => {
      state.renderFrame = null
      renderAll()
    })
  }

  document.addEventListener('click', (event) => {
    const dayButton = event.target.closest('[data-school-meal-date]')
    if (dayButton) {
      switchDay(dayButton.dataset.schoolMealDate)
      return
    }

    const weekButton = event.target.closest('[data-school-meal-week]')
    if (weekButton) {
      navigateWeek(Number(weekButton.dataset.schoolMealWeek))
      return
    }

    const currentWeek = event.target.closest('[data-school-meal-current-week]')
    if (currentWeek && !currentWeek.disabled) {
      returnToCurrentWeek()
      return
    }

    const retry = event.target.closest('[data-school-meal-retry]')
    if (retry) fetchWeek(viewedWeekDates(), true)
  })

  function mutationIsInsideMealUi(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
    return Boolean(target?.closest?.('.school-meal-home-mount, .school-meal-page'))
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.every(mutationIsInsideMealUi)) return
    scheduleRender()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  const initialCurrentWeek = currentWeekDates()
  loadCachedRange(weekRangeKey(initialCurrentWeek))
  scheduleRender()
  fetchWeek(initialCurrentWeek, false)
})()
