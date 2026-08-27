(() => {
  const labels = {
    home: '홈',
    todo: '투두',
    timetable: '시간표',
    meal: '급식',
    academic: '학사일정',
  }

  let activeRequest = 0

  function cleanRoute() {
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function targetButton(tab) {
    const label = labels[tab]
    if (!label) return null
    return Array.from(document.querySelectorAll('.bottom-nav .nav-button'))
      .find((button) => button.querySelector('span')?.textContent?.trim() === label) || null
  }

  function routeToTab(tab, { cleanUrl = false } = {}) {
    if (!labels[tab]) return
    const requestId = activeRequest + 1
    activeRequest = requestId
    let observer = null
    let timer = null

    const finish = () => {
      if (requestId !== activeRequest) return true
      const target = targetButton(tab)
      if (!target) return false
      target.click()
      if (cleanUrl) cleanRoute()
      observer?.disconnect()
      if (timer) window.clearTimeout(timer)
      return true
    }

    if (finish()) return

    observer = new MutationObserver(finish)
    observer.observe(document.documentElement, { childList: true, subtree: true })
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
