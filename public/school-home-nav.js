(() => {
  let frame = 0

  const SCHEDULE_LABELS = {
    todo: '리마인더',
    academic: '학사일정',
    meal: '급식',
  }

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

  function activateTab(tab) {
    const button = document.querySelector(`.bottom-nav .nav-button[data-tab="${tab}"]`)
    if (!button) return false
    button.click()
    return true
  }

  function activateClassSection(section) {
    if (section !== 'timetable') return false
    const button = document.querySelector('.class-nav-subbutton[aria-label="우리 반 시간표"]')
    if (!button) return false
    button.click()
    return true
  }

  function activateScheduleSection(section) {
    const label = SCHEDULE_LABELS[section]
    if (!label) return false
    const buttons = [...document.querySelectorAll('.station-schedule-switcher button')]
    const button = buttons.find((candidate) => candidate.textContent.trim() === label)
    if (!button) return false
    button.click()
    return true
  }

  function afterReactCommit(callback) {
    let attempts = 0
    function run() {
      attempts += 1
      if (callback() || attempts >= 6) return
      window.requestAnimationFrame(run)
    }
    window.requestAnimationFrame(run)
  }

  function navigateHome(route) {
    if (!route || !activateTab(route.tab)) return

    if (route.tab === 'class') {
      afterReactCommit(() => activateClassSection(route.section))
      return
    }

    if (route.tab === 'schedule') {
      afterReactCommit(() => activateScheduleSection(route.section))
    }
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
