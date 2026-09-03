(() => {
  const routes = new Set([
    'home',
    'todo',
    'timetable',
    'board',
    'study',
    'meal',
    'academic',
  ])

  function cleanRoute() {
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function routeToTab(tab, { cleanUrl = false } = {}) {
    if (!routes.has(tab)) return false
    const accepted = window.SHubNavigation?.navigate(tab) === true
    if (accepted && cleanUrl) cleanRoute()
    return accepted
  }

  const params = new URLSearchParams(window.location.search)
  const requestedTab = params.get('tab')
  if (requestedTab && routes.has(requestedTab)) routeToTab(requestedTab, { cleanUrl: true })

  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type !== 'SCHOOL_NOTIFICATION_ROUTE') return
    const tab = String(event.data?.tab || '')
    if (!routes.has(tab)) return
    routeToTab(tab)
  })
})()
