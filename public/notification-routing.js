(() => {
  const labels = {
    home: ['홈'],
    todo: ['리마인더', '투두'],
    timetable: ['시간표'],
    board: ['게시판'],
    study: ['스터디'],
    meal: ['급식'],
    academic: ['학사일정'],
  }

  const stationFor = {
    timetable: 'class',
    board: 'class',
    todo: 'schedule',
    academic: 'schedule',
    meal: 'schedule',
  }

  const stationLabels = {
    home: ['홈'],
    class: ['우리반'],
    study: ['스터디'],
    schedule: ['일정'],
  }

  let activeRequest = 0

  function cleanRoute() {
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function buttonLabel(button) {
    return button?.querySelector('span')?.textContent?.trim() || button?.textContent?.trim() || ''
  }

  function stationButton(station) {
    const byData = document.querySelector(`.bottom-nav .nav-button[data-tab="${station}"]`)
    if (byData) return byData
    const aliases = stationLabels[station] || []
    return Array.from(document.querySelectorAll('.bottom-nav .nav-button'))
      .find((button) => aliases.includes(buttonLabel(button))) || null
  }

  function leafButton(tab) {
    const byData = Array.from(document.querySelectorAll('.class-top-segment-button[data-unread-key]'))
      .find((button) => button.dataset.unreadKey === tab)
    if (byData) return byData
    const aliases = labels[tab] || []
    return Array.from(document.querySelectorAll('.class-top-segment-button'))
      .find((button) => aliases.includes(String(button.textContent || '').trim())) || null
  }

  function routeToTab(tab, { cleanUrl = false } = {}) {
    if (!labels[tab]) return
    const requestId = activeRequest + 1
    activeRequest = requestId
    let observer = null
    let timer = null

    const complete = () => {
      if (cleanUrl) cleanRoute()
      observer?.disconnect()
      if (timer) window.clearTimeout(timer)
      return true
    }

    const finish = () => {
      if (requestId !== activeRequest) return true
      const parentStation = stationFor[tab]
      if (parentStation) {
        const parent = stationButton(parentStation)
        if (!parent) return false
        if (!parent.classList.contains('active')) parent.click()
        const leaf = leafButton(tab)
        if (!leaf) return false
        if (!leaf.classList.contains('is-active')) leaf.click()
        return complete()
      }

      const station = tab === 'study' ? 'study' : 'home'
      const target = stationButton(station)
      if (!target) return false
      if (!target.classList.contains('active')) target.click()
      return complete()
    }

    if (finish()) return

    observer = new MutationObserver(finish)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-unread-key'],
    })
    timer = window.setTimeout(() => {
      observer?.disconnect()
      if (cleanUrl && requestId === activeRequest) cleanRoute()
    }, 10000)
  }

  const params = new URLSearchParams(window.location.search)
  const requestedTab = params.get('tab')
  if (requestedTab && labels[requestedTab]) routeToTab(requestedTab, { cleanUrl: true })

  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type !== 'SCHOOL_NOTIFICATION_ROUTE') return
    const tab = String(event.data?.tab || '')
    if (!labels[tab]) return
    routeToTab(tab)
  })
})()
