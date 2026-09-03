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

  let handler = null
  let pendingRoute = null

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

  function deliver(route) {
    if (typeof handler !== 'function') {
      pendingRoute = route
      return true
    }
    handler(route)
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

    if (pendingRoute) {
      const route = pendingRoute
      pendingRoute = null
      handler(route)
    }

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
