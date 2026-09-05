(() => {
  let frame = 0

  function homeRouteFor(item) {
    if (!(item instanceof Element)) return null
    if (item.matches('.current-class-card')) {
      return { tab: 'class', section: 'timetable', label: '시간표 열기' }
    }
    if (item.matches('.home-section') && item.querySelector('.period-strip, .today-timetable-empty')) {
      return { tab: 'class', section: 'timetable', label: '시간표 열기' }
    }
    return null
  }

  function navigateHome(route) {
    if (!route) return
    window.SHubNavigation?.navigate(route)
  }

  function interactiveDescendant(target, item) {
    if (!(target instanceof Element) || target === item) return false
    return Boolean(target.closest('button, a, input, select, textarea, [role="button"]'))
  }

  function enhanceHome() {
    const items = document.querySelectorAll('.home-stack > *')
    if (!items.length) return

    items.forEach((item) => {
      if (item.dataset.homeNavReady === 'true') return
      const route = homeRouteFor(item)
      if (!route) return

      item.dataset.homeNavReady = 'true'
      item.dataset.homeDestination = `${route.tab}:${route.section || ''}`
      item.setAttribute('role', 'button')
      item.setAttribute('tabindex', '0')
      item.setAttribute('aria-label', route.label)
      item.style.cursor = 'pointer'
      item.style.touchAction = 'manipulation'

      item.addEventListener('click', (event) => {
        if (interactiveDescendant(event.target, item)) return
        navigateHome(route)
      })
      item.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        navigateHome(route)
      })
    })
  }

  function scheduleEnhance() {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      enhanceHome()
    })
  }

  const observer = new MutationObserver(scheduleEnhance)
  const appRoot = document.getElementById('root')
  if (appRoot) observer.observe(appRoot, { childList: true, subtree: true })

  window.addEventListener('pagehide', () => {
    observer.disconnect()
    if (frame) window.cancelAnimationFrame(frame)
  }, { once: true })

  scheduleEnhance()
})()
