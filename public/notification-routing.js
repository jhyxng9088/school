(() => {
  const params = new URLSearchParams(window.location.search)
  const requestedTab = params.get('tab')
  const labels = {
    home: '홈',
    todo: '투두',
    timetable: '시간표',
    meal: '급식',
    academic: '학사일정',
  }

  if (!requestedTab || !labels[requestedTab]) return

  let finished = false
  let observer = null
  let timer = null

  function cleanRoute() {
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function routeToRequestedTab() {
    if (finished) return true
    const buttons = Array.from(document.querySelectorAll('.bottom-nav .nav-button'))
    if (!buttons.length) return false

    const target = buttons.find((button) => button.textContent.trim() === labels[requestedTab])
    if (!target) return false

    finished = true
    target.click()
    cleanRoute()
    observer?.disconnect()
    if (timer) window.clearTimeout(timer)
    return true
  }

  if (routeToRequestedTab()) return

  observer = new MutationObserver(() => routeToRequestedTab())
  observer.observe(document.documentElement, { childList: true, subtree: true })

  timer = window.setTimeout(() => {
    observer?.disconnect()
    if (!finished) cleanRoute()
  }, 10000)
})()
