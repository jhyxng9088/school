(() => {
  if (/SamsungBrowser/i.test(navigator.userAgent)) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const CELL_SELECTOR = '.period-item, .week-cell:not(.editor-cell)'
  const CHANGE_SECTION_SELECTOR = '.week-changes'
  const CHANGE_ITEM_SELECTOR = '.change-item'
  const TIMETABLE_PAGE_SELECTOR = '.timetable-page'
  const SOFT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
  const PAGE_READY_DELAY = 1120

  const queuedCells = new Set()
  const runningCellAnimations = new WeakMap()
  const readyTimers = new WeakMap()
  let cellFrame = null

  function timetablePageFor(node) {
    return node?.closest?.(TIMETABLE_PAGE_SELECTOR) || null
  }

  function isTimetableReady(node) {
    const page = timetablePageFor(node)
    return Boolean(page && page.dataset.schoolTimetableMotionReady === 'true')
  }

  function schedulePageReady(page) {
    if (!page || page.dataset.schoolTimetableMotionReady === 'true' || readyTimers.has(page)) return

    const timer = window.setTimeout(() => {
      readyTimers.delete(page)
      if (!page.isConnected) return
      page.dataset.schoolTimetableMotionReady = 'true'
    }, reducedMotion.matches ? 0 : PAGE_READY_DELAY)

    readyTimers.set(page, timer)
  }

  function queueCell(cell) {
    if (!cell || reducedMotion.matches || !isTimetableReady(cell)) return
    queuedCells.add(cell)
    if (cellFrame !== null) return

    cellFrame = requestAnimationFrame(() => {
      cellFrame = null
      for (const target of queuedCells) animateCellChange(target)
      queuedCells.clear()
    })
  }

  function animateCellChange(cell) {
    if (!cell.isConnected || !isTimetableReady(cell)) return

    runningCellAnimations.get(cell)?.cancel()

    const computed = getComputedStyle(cell)
    const finalOpacity = Number.parseFloat(computed.opacity) || 1
    const startOpacity = Math.max(0.18, finalOpacity * 0.76)

    const animation = cell.animate(
      [
        {
          opacity: startOpacity,
          transform: 'translate3d(0, 1.5px, 0)',
        },
        {
          opacity: finalOpacity,
          transform: 'translate3d(0, 0, 0)',
        },
      ],
      {
        duration: 720,
        easing: SOFT_EASE,
      },
    )

    runningCellAnimations.set(cell, animation)
    animation.onfinish = () => {
      if (runningCellAnimations.get(cell) === animation) runningCellAnimations.delete(cell)
    }
    animation.oncancel = animation.onfinish
  }

  function finishRemove(button) {
    if (!button?.isConnected) return
    button.dataset.schoolTimetableMotionPassthrough = 'true'
    button.click()
    queueMicrotask(() => delete button.dataset.schoolTimetableMotionPassthrough)
  }

  function animateRemoval(target, button, { wholeSection = false } = {}) {
    if (!target?.isConnected || reducedMotion.matches) {
      finishRemove(button)
      return
    }

    const rect = target.getBoundingClientRect()
    const computed = getComputedStyle(target)
    target.style.pointerEvents = 'none'
    target.style.overflow = 'hidden'
    target.style.minHeight = '0px'

    const from = {
      height: `${rect.height}px`,
      opacity: Number.parseFloat(computed.opacity) || 1,
      transform: 'translate3d(0, 0, 0)',
    }

    const to = {
      height: '0px',
      opacity: 0,
      transform: 'translate3d(0, -4px, 0)',
    }

    if (wholeSection) {
      from.marginTop = computed.marginTop
      to.marginTop = '0px'
    } else {
      from.paddingTop = computed.paddingTop
      from.paddingBottom = computed.paddingBottom
      to.paddingTop = '0px'
      to.paddingBottom = '0px'
    }

    const animation = target.animate([from, to], {
      duration: wholeSection ? 660 : 560,
      easing: SOFT_EASE,
      fill: 'both',
    })

    animation.onfinish = () => finishRemove(button)
  }

  // Revert buttons execute their React handler immediately; motion must never block data changes.

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const cell = mutation.target.matches?.(CELL_SELECTOR) ? mutation.target : null
        if (cell) queueCell(cell)
        continue
      }

      if (mutation.type === 'characterData') {
        const cell = mutation.target.parentElement?.closest(CELL_SELECTOR)
        if (cell) queueCell(cell)
        continue
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue

        if (node.matches(TIMETABLE_PAGE_SELECTOR)) schedulePageReady(node)
        node.querySelectorAll?.(TIMETABLE_PAGE_SELECTOR).forEach(schedulePageReady)

        if (isTimetableReady(node)) {
          if (node.matches(CELL_SELECTOR)) queueCell(node)
          node.querySelectorAll?.(CELL_SELECTOR).forEach(queueCell)
        }
      }
    }
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  document.querySelectorAll(TIMETABLE_PAGE_SELECTOR).forEach(schedulePageReady)
})()
