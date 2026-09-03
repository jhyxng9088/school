(() => {
  if (window.SHubNavigation) return

  const LEGACY_ROUTES = Object.freeze({
    home: { tab: 'home' },
    class: { tab: 'class', section: 'timetable' },
    timetable: { tab: 'class', section: 'timetable' },
    board: { tab: 'class', section: 'board' },
    ai: { tab: 'ai' },
    study: { tab: 'study' },
    schedule: { tab: 'schedule', section: 'todo' },
    todo: { tab: 'schedule', section: 'todo' },
    academic: { tab: 'schedule', section: 'academic' },
    meal: { tab: 'schedule', section: 'meal' },
  })

  const VALID_SECTIONS = Object.freeze({
    class: new Set(['timetable', 'board']),
    schedule: new Set(['todo', 'academic', 'meal']),
  })

  const SCHEDULE_LABELS = Object.freeze({
    todo: '리마인더',
    academic: '학사일정',
    meal: '급식',
  })

  let handler = null
  let pendingRoute = null
  let retryObserver = null
  let retryTimer = null
  let retryFrame = 0

  function normalizeRoute(input) {
    if (typeof input === 'string') {
      const route = LEGACY_ROUTES[input]
      return route ? { ...route } : null
    }

    if (!input || typeof input !== 'object') return null

    const base = LEGACY_ROUTES[String(input.tab || '')]
    if (!base) return null

    const route = { ...base }
    const sections = VALID_SECTIONS[route.tab]
    if (sections && sections.has(String(input.section || ''))) {
      route.section = String(input.section)
    }
    return route
  }

  function stopLegacyRetry() {
    retryObserver?.disconnect()
    retryObserver = null
    if (retryTimer) window.clearTimeout(retryTimer)
    retryTimer = null
    if (retryFrame) window.cancelAnimationFrame?.(retryFrame)
    retryFrame = 0
  }

  function findScheduleButton(section) {
    const explicit = document.querySelector(`.station-schedule-switcher [data-unread-key="${section}"]`)
    if (explicit) return explicit
    const label = SCHEDULE_LABELS[section]
    if (!label) return null
    return Array.from(document.querySelectorAll('.station-schedule-switcher button'))
      .find((button) => button.textContent?.trim() === label) || null
  }

  function tryLegacyDomRoute(route) {
    if (typeof document === 'undefined') return false

    const topButton = document.querySelector(`.bottom-nav .nav-button[data-tab="${route.tab}"]`)
    if (!topButton) return false

    const topIsActive = topButton.getAttribute('aria-current') === 'page'
    if (!topIsActive) {
      topButton.click()
      if (route.section) return false
      return true
    }

    if (route.tab === 'class' && route.section) {
      const button = document.querySelector(`.class-nav-subbutton[aria-label="우리 반 ${route.section === 'board' ? '게시판' : '시간표'}"]`)
      if (!button) return false
      button.click()
      return true
    }

    if (route.tab === 'schedule' && route.section) {
      const button = findScheduleButton(route.section)
      if (!button) return false
      button.click()
      return true
    }

    return true
  }

  function flushPendingRoute() {
    if (!pendingRoute) {
      stopLegacyRetry()
      return
    }

    if (typeof handler === 'function') {
      const route = pendingRoute
      pendingRoute = null
      stopLegacyRetry()
      handler(route)
      return
    }

    if (tryLegacyDomRoute(pendingRoute)) {
      pendingRoute = null
      stopLegacyRetry()
    }
  }

  function scheduleLegacyRetry() {
    if (typeof document === 'undefined' || retryObserver) return

    const scheduleFlush = () => {
      if (retryFrame) return
      retryFrame = window.requestAnimationFrame?.(() => {
        retryFrame = 0
        flushPendingRoute()
      }) || 0
      if (!retryFrame) flushPendingRoute()
    }

    retryObserver = new MutationObserver(scheduleFlush)
    retryObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'aria-current', 'data-unread-key'],
    })
    retryTimer = window.setTimeout(() => {
      pendingRoute = null
      stopLegacyRetry()
    }, 10000)
    scheduleFlush()
  }

  function deliver(route) {
    if (typeof handler === 'function') {
      handler(route)
      return true
    }

    if (tryLegacyDomRoute(route)) return true

    pendingRoute = route
    scheduleLegacyRetry()
    return true
  }

  function navigate(input) {
    const route = normalizeRoute(input)
    if (!route) return false
    return deliver(route)
  }

  function register(nextHandler) {
    if (typeof nextHandler !== 'function') return () => {}
    handler = nextHandler
    flushPendingRoute()

    return () => {
      if (handler === nextHandler) handler = null
    }
  }

  window.SHubNavigation = Object.freeze({
    navigate,
    normalizeRoute,
    register,
  })
})()
