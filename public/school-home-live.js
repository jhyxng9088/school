(() => {
  const PHONE_PORTRAIT = window.matchMedia('(max-width: 600px) and (orientation: portrait)')
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)
  let trackedStack = null
  let lastPriority = null
  let boundaryTimer = 0

  function isLunchPriority(now = new Date()) {
    const minutes = now.getHours() * 60 + now.getMinutes()
    return PHONE_PORTRAIT.matches && minutes >= 12 * 60 + 50 && minutes < 14 * 60
  }

  function nextPriorityBoundary(now = new Date()) {
    const lunchStart = new Date(now)
    lunchStart.setHours(12, 50, 0, 0)
    const lunchEnd = new Date(now)
    lunchEnd.setHours(14, 0, 0, 0)

    if (now < lunchStart) return lunchStart
    if (now < lunchEnd) return lunchEnd

    lunchStart.setDate(lunchStart.getDate() + 1)
    return lunchStart
  }

  function captureRects(stack) {
    return new Map(
      [...stack.children].map((node) => [node, node.getBoundingClientRect()]),
    )
  }

  function animateReorder(stack, before) {
    if (REDUCED_MOTION.matches || SAMSUNG_INTERNET) return

    requestAnimationFrame(() => {
      const children = [...stack.children]
      children.forEach((node, index) => {
        const previous = before.get(node)
        if (!previous) return
        const current = node.getBoundingClientRect()
        const deltaX = previous.left - current.left
        const deltaY = previous.top - current.top
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return

        node.getAnimations().forEach((animation) => {
          if (animation.id === 'home-lunch-reorder') animation.cancel()
        })

        const animation = node.animate(
          [
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0.94 },
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          ],
          {
            duration: 920,
            delay: Math.min(index * 42, 168),
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'both',
          },
        )
        animation.id = 'home-lunch-reorder'
      })
    })
  }

  function syncPriority() {
    const stack = document.querySelector('.home-stack')
    const priority = isLunchPriority()

    if (!stack) {
      trackedStack = null
      lastPriority = priority
      return
    }

    if (stack !== trackedStack) {
      trackedStack = stack
      lastPriority = priority
      stack.classList.toggle('is-meal-priority', priority)
      stack.dataset.homeLunchReady = 'true'
      return
    }

    if (priority === lastPriority) return

    const before = captureRects(stack)
    stack.classList.toggle('is-meal-priority', priority)
    lastPriority = priority
    animateReorder(stack, before)
  }

  function schedulePriorityBoundary(now = new Date()) {
    if (boundaryTimer) window.clearTimeout(boundaryTimer)
    const boundary = nextPriorityBoundary(now)
    const delay = Math.max(100, boundary.getTime() - now.getTime() + 100)
    boundaryTimer = window.setTimeout(() => {
      boundaryTimer = 0
      syncPriority()
      schedulePriorityBoundary()
    }, delay)
  }

  function syncAfterResume() {
    if (document.hidden) return
    syncPriority()
    schedulePriorityBoundary()
  }

  const observer = new MutationObserver(syncPriority)
  const appRoot = document.getElementById('root')
  if (appRoot) {
    observer.observe(appRoot, {
      childList: true,
      subtree: true,
    })
  }

  window.addEventListener('resize', syncPriority)
  window.addEventListener('orientationchange', syncPriority)
  window.addEventListener('focus', syncAfterResume)
  document.addEventListener('visibilitychange', syncAfterResume)
  PHONE_PORTRAIT.addEventListener?.('change', syncPriority)

  window.addEventListener('pagehide', () => {
    if (boundaryTimer) window.clearTimeout(boundaryTimer)
    observer.disconnect()
    window.removeEventListener('resize', syncPriority)
    window.removeEventListener('orientationchange', syncPriority)
    window.removeEventListener('focus', syncAfterResume)
    document.removeEventListener('visibilitychange', syncAfterResume)
    PHONE_PORTRAIT.removeEventListener?.('change', syncPriority)
  }, { once: true })

  syncPriority()
  schedulePriorityBoundary()
})()
