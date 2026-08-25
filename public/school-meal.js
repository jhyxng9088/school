(() => {
  const SCHOOL = {
    officeCode: 'J10',
    schoolCode: '7530093',
    schoolName: '수지고등학교',
  }
  const CACHE_KEY = 'school.meals.suji.v1'
  const CACHE_MAX_AGE = 1000 * 60 * 60 * 12
  const SOFT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
  const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

  const state = {
    meals: [],
    loading: false,
    error: null,
    stale: false,
    selectedDate: null,
    loadedRange: '',
    renderFrame: null,
  }

  function pad(value) {
    return String(value).padStart(2, '0')
  }

  function rawDate(date) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
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

  function loadCache(rangeKey) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (!cached || cached.rangeKey !== rangeKey || !Array.isArray(cached.meals)) return false
      state.meals = cached.meals
      state.stale = Date.now() - Number(cached.savedAt || 0) > CACHE_MAX_AGE
      state.loadedRange = rangeKey
      return true
    } catch {
      return false
    }
  }

  function saveCache(rangeKey, meals) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        rangeKey,
        savedAt: Date.now(),
        schoolCode: SCHOOL.schoolCode,
        meals,
      }))
    } catch {
      // Meal data is still usable for this session when storage is unavailable.
    }
  }

  function mealForRawDate(value) {
    const sameDay = state.meals.filter((meal) => meal.rawDate === value)
    return sameDay.find((meal) => meal.mealCode === '2') || sameDay[0] || null
  }

  async function fetchWeek(force = false) {
    const dates = getWeekDates(new Date())
    const rangeKey = weekRangeKey(dates)
    if (!state.selectedDate) {
      const today = new Date()
      const todayIsWeekday = today.getDay() >= 1 && today.getDay() <= 5
      state.selectedDate = rawDate(todayIsWeekday ? today : dates[0])
    }

    const hasCache = loadCache(rangeKey)
    if (hasCache) scheduleRender()
    if (!force && hasCache && !state.stale) return
    if (state.loading) return

    state.loading = true
    state.error = null
    scheduleRender()

    try {
      const url = new URL('https://open.neis.go.kr/hub/mealServiceDietInfo')
      url.searchParams.set('Type', 'json')
      url.searchParams.set('pIndex', '1')
      url.searchParams.set('pSize', '5')
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

      state.meals = meals
      state.stale = false
      state.loadedRange = rangeKey
      saveCache(rangeKey, meals)
    } catch (error) {
      state.error = error
      if (!state.meals.length) state.stale = false
    } finally {
      state.loading = false
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
    const mount = ensureHomeMount(section)
    const todayRaw = rawDate(new Date())
    const meal = mealForRawDate(todayRaw)

    if (!meal && state.loading && !state.meals.length) {
      mount.innerHTML = '<p class="school-meal-home-loading">급식 불러오는 중…</p>'
      return
    }

    if (!meal) {
      mount.innerHTML = `<p class="school-meal-home-empty">${state.error && !state.meals.length ? '급식 정보를 불러오지 못했어.' : '오늘은 등록된 급식이 없어.'}</p>`
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
    if (eyebrow) eyebrow.textContent = SCHOOL.schoolName

    let mount = host.querySelector('.school-meal-page')
    if (!mount) {
      mount = document.createElement('section')
      mount.className = 'school-meal-page'
      host.appendChild(mount)
    }
    return mount
  }

  function renderMealPage() {
    const host = mealPageHost()
    if (!host) return
    const mount = ensureMealPage(host)
    if (!mount) return

    const dates = getWeekDates(new Date())
    const todayRaw = rawDate(new Date())
    if (!state.selectedDate) state.selectedDate = todayRaw
    const selected = dates.find((date) => rawDate(date) === state.selectedDate) || dates[0]
    const selectedRaw = rawDate(selected)
    const meal = mealForRawDate(selectedRaw)

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
    if (!meal && state.loading && !state.meals.length) {
      detail = `
        <div class="school-meal-status">
          <strong>급식 불러오는 중</strong>
          <p>수지고등학교 NEIS 급식 정보를 확인하고 있어.</p>
        </div>
      `
    } else if (!meal && state.error && !state.meals.length) {
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
      <div class="school-meal-week-head">
        <strong>${escapeHtml(formatWeekRange(dates))}</strong>
        <span>${escapeHtml(SCHOOL.schoolName)}</span>
      </div>
      <div class="school-meal-days">${dayButtons}</div>
      <section class="school-meal-detail" data-school-meal-detail>${detail}</section>
      ${state.stale ? '<p class="school-meal-cache-note">마지막으로 저장된 급식 정보를 표시하고 있어.</p>' : ''}
    `
  }

  function animateDetailChange(detail) {
    if (!detail || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    detail.animate(
      [
        { opacity: 0.72, transform: 'translate3d(0, 3px, 0)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 520, easing: SOFT_EASE },
    )
  }

  function renderAll() {
    renderHome()
    renderMealPage()
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
      const nextDate = dayButton.dataset.schoolMealDate
      if (nextDate && nextDate !== state.selectedDate) {
        state.selectedDate = nextDate
        renderMealPage()
        animateDetailChange(document.querySelector('[data-school-meal-detail]'))
      }
      return
    }

    const retry = event.target.closest('[data-school-meal-retry]')
    if (retry) fetchWeek(true)
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

  scheduleRender()
  fetchWeek(false)
})()
