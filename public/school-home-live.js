(() => {
  const PHONE_PORTRAIT = window.matchMedia('(max-width: 600px) and (orientation: portrait)')
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  const SAMSUNG_INTERNET = /SamsungBrowser/i.test(navigator.userAgent)
  let trackedStack = null
  let lastPriority = null

  function isLunchPriority(now = new Date()) {
    const minutes = now.getHours() * 60 + now.getMinutes()
    return PHONE_PORTRAIT.matches && minutes >= 12 * 60 + 50 && minutes < 14 * 60
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

  const observer = new MutationObserver(syncPriority)
  const appRoot = document.getElementById('root')
  if (appRoot) {
    observer.observe(appRoot, {
      childList: true,
      subtree: true,
    })
  }

  const timer = window.setInterval(syncPriority, 15000)
  window.addEventListener('resize', syncPriority)
  window.addEventListener('orientationchange', syncPriority)
  PHONE_PORTRAIT.addEventListener?.('change', syncPriority)

  window.addEventListener('pagehide', () => {
    window.clearInterval(timer)
    observer.disconnect()
  }, { once: true })

  syncPriority()
})()
