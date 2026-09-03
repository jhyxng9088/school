(() => {
  let frame = 0

  function homeRouteFor(item) {
    if (!(item instanceof Element)) return null
    if (item.matches('.current-class-card')) {
      return { tab: 'class', section: 'timetable', label: '시간표 열기' }
    }
    if (item.matches('.todo-home-preview')) {
      return { tab: 'schedule', section: 'todo', label: '리마인더 열기' }
    }
    if (item.matches('.academic-preview')) {
      return { tab: 'schedule', section: 'academic', label: '학사일정 열기' }
    }
    if (item.matches('.meal-preview')) {
      return { tab: 'schedule', section: 'meal', label: '급식 열기' }
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

  function installStudyScrollStability() {
    if (!document.querySelector('style[data-study-scroll-stability]')) {
      const style = document.createElement('style')
      style.dataset.studyScrollStability = 'true'
      style.textContent = `
        .preview-study-ranking-stage[data-direction] {
          animation: none !important;
          will-change: auto !important;
        }
        .preview-study-ranking-stage .preview-study-today-person {
          animation: none !important;
          will-change: auto !important;
        }
      `
      document.head.appendChild(style)
    }

    document.addEventListener('pointerdown', deferStudyScopeTouchToClick, true)
  }

  function deferStudyScopeTouchToClick(event) {
    if (event.pointerType === 'mouse') return
    const target = event.target instanceof Element ? event.target : null
    const button = target?.closest('.preview-study-ranking-tabs[aria-label="공부 랭킹 범위"] button')
    if (!button) return

    // The React scope control also changes state on pointerdown. On touch devices
    // that mutates the ranking DOM before the gesture has fully settled, which can
    // fight WebKit scroll momentum. Let the normal click handler perform the same
    // state change after pointerup instead.
    event.stopPropagation()
  }

  function scheduleEnhance() {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      enhanceHome()
    })
  }

  const observer = new MutationObserver(scheduleEnhance)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  installStudyScrollStability()

  window.addEventListener('pagehide', () => {
    observer.disconnect()
    document.removeEventListener('pointerdown', deferStudyScopeTouchToClick, true)
    if (frame) window.cancelAnimationFrame(frame)
  }, { once: true })

  scheduleEnhance()
})()
