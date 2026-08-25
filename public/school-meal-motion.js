(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const PAGE_SELECTOR = '.meal-page'
  const DETAIL_SELECTOR = '.stage3-detail'
  const DAY_SELECTOR = '.stage3-day-button'
  const READY_DELAY = 1120
  const SOFT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

  const running = new WeakMap()
  const readyTimers = new WeakMap()
  const pendingDirections = new WeakMap()
  const pendingFrames = new WeakMap()

  function scheduleReady(page) {
    if (!page || page.dataset.schoolMealMotionReady === 'true' || readyTimers.has(page)) return

    const timer = window.setTimeout(() => {
      readyTimers.delete(page)
      if (!page.isConnected) return
      page.dataset.schoolMealMotionReady = 'true'
    }, reducedMotion.matches ? 0 : READY_DELAY)

    readyTimers.set(page, timer)
  }

  function selectedDayIndex(page) {
    return [...page.querySelectorAll(DAY_SELECTOR)].findIndex((button) => button.classList.contains('is-selected'))
  }

  function interactionDirection(button, page) {
    if (button.matches(DAY_SELECTOR)) {
      const buttons = [...page.querySelectorAll(DAY_SELECTOR)]
      const targetIndex = buttons.indexOf(button)
      const currentIndex = selectedDayIndex(page)
      if (targetIndex < 0 || currentIndex < 0 || targetIndex === currentIndex) return 0
      return targetIndex > currentIndex ? 1 : -1
    }

    const label = button.getAttribute('aria-label') || ''
    if (label === '다음 주') return 1
    if (label === '이전 주') return -1

    if (button.classList.contains('stage3-week-title')) {
      const text = button.textContent || ''
      if (/다음 주|주 후/.test(text)) return -1
      if (/지난 주|주 전/.test(text)) return 1
    }

    return 0
  }

  function animateCommittedDetail(page, direction) {
    if (!page?.isConnected || page.dataset.schoolMealMotionReady !== 'true' || reducedMotion.matches) return

    const detail = page.querySelector(DETAIL_SELECTOR)
    if (!detail) return

    const previous = running.get(detail)
    let fromOpacity = 0.88
    let fromTransform = `translate3d(${direction * 9}px, 2px, 0)`
    let duration = 740

    if (previous) {
      const computed = getComputedStyle(detail)
      fromOpacity = Number.parseFloat(computed.opacity) || 1
      fromTransform = computed.transform && computed.transform !== 'none'
        ? computed.transform
        : 'translate3d(0, 0, 0)'
      duration = 560
      previous.cancel()
    }

    detail.style.willChange = 'transform, opacity'

    const animation = detail.animate(
      [
        { opacity: fromOpacity, transform: fromTransform },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration,
        easing: SOFT_EASE,
      },
    )

    running.set(detail, animation)

    const finish = () => {
      if (running.get(detail) !== animation) return
      running.delete(detail)
      detail.style.willChange = ''
    }

    animation.onfinish = finish
    animation.oncancel = finish
  }

  function animateAfterCommit(page) {
    const direction = pendingDirections.get(page)
    if (!direction) return
    pendingDirections.delete(page)

    const previousFrame = pendingFrames.get(page)
    if (previousFrame) cancelAnimationFrame(previousFrame)

    // Wait until React has committed the new meal DOM and the browser has had
    // a frame to settle layout. Motion starts only after the content is real.
    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        pendingFrames.delete(page)
        animateCommittedDetail(page, direction)
      })
      pendingFrames.set(page, secondFrame)
    })

    pendingFrames.set(page, firstFrame)
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest(`${PAGE_SELECTOR} ${DAY_SELECTOR}, ${PAGE_SELECTOR} .stage3-week-nav button`)
    if (!button) return

    const page = button.closest(PAGE_SELECTOR)
    if (!page) return

    const direction = interactionDirection(button, page)
    if (!direction) return

    // Record only intent here. React owns the actual state change and render.
    // The observer below starts the animation after that render is committed.
    pendingDirections.set(page, direction)
  }, true)

  const observer = new MutationObserver((mutations) => {
    const pagesToAnimate = new Set()

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches(PAGE_SELECTOR)) scheduleReady(node)
        node.querySelectorAll?.(PAGE_SELECTOR).forEach(scheduleReady)
      }

      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
      const page = target?.closest?.(PAGE_SELECTOR)
      const detail = target?.closest?.(DETAIL_SELECTOR)
      if (page && detail && pendingDirections.has(page)) pagesToAnimate.add(page)
    }

    for (const page of pagesToAnimate) animateAfterCommit(page)
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  })

  document.querySelectorAll(PAGE_SELECTOR).forEach(scheduleReady)
})()
