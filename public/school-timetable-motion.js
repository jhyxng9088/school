(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const CELL_SELECTOR = '.period-item, .week-cell:not(.editor-cell)'
  const CHANGE_SECTION_SELECTOR = '.week-changes'
  const CHANGE_ITEM_SELECTOR = '.change-item'
  const SOFT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

  const queuedCells = new Set()
  const runningCellAnimations = new WeakMap()
  let cellFrame = null

  function queueCell(cell) {
    if (!cell || reducedMotion.matches) return
    queuedCells.add(cell)
    if (cellFrame !== null) return

    cellFrame = requestAnimationFrame(() => {
      cellFrame = null
      for (const target of queuedCells) animateCellChange(target)
      queuedCells.clear()
    })
  }

  function animateCellChange(cell) {
    if (!cell.isConnected) return

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

  function animateSectionIn(section) {
    if (!section?.isConnected || reducedMotion.matches || section.dataset.schoolMotionEntered === 'true') return
    section.dataset.schoolMotionEntered = 'true'

    const targetHeight = Math.max(section.scrollHeight, section.getBoundingClientRect().height)
    const finalMarginTop = getComputedStyle(section).marginTop
    section.style.overflow = 'hidden'

    const animation = section.animate(
      [
        {
          height: '0px',
          marginTop: '0px',
          opacity: 0,
          transform: 'translate3d(0, 8px, 0)',
        },
        {
          height: `${targetHeight}px`,
          marginTop: finalMarginTop,
          opacity: 1,
          transform: 'translate3d(0, 0, 0)',
        },
      ],
      {
        duration: 840,
        easing: SOFT_EASE,
        fill: 'both',
      },
    )

    animation.onfinish = () => {
      animation.cancel()
      section.style.overflow = ''
    }
  }

  function animateItemIn(item) {
    if (!item?.isConnected || reducedMotion.matches || item.dataset.schoolMotionEntered === 'true') return
    item.dataset.schoolMotionEntered = 'true'

    const targetHeight = item.getBoundingClientRect().height
    item.style.overflow = 'hidden'
    item.style.minHeight = '0px'

    const animation = item.animate(
      [
        {
          height: '0px',
          opacity: 0,
          transform: 'translate3d(0, 6px, 0)',
          paddingTop: '0px',
          paddingBottom: '0px',
        },
        {
          height: `${targetHeight}px`,
          opacity: 1,
          transform: 'translate3d(0, 0, 0)',
          paddingTop: '10px',
          paddingBottom: '10px',
        },
      ],
      {
        duration: 700,
        easing: SOFT_EASE,
        fill: 'both',
      },
    )

    animation.onfinish = () => {
      animation.cancel()
      item.style.overflow = ''
      item.style.minHeight = ''
    }
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

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-change')
    if (!button || button.dataset.schoolTimetableMotionPassthrough === 'true') return
    if (reducedMotion.matches) return

    const item = button.closest(CHANGE_ITEM_SELECTOR)
    const section = button.closest(CHANGE_SECTION_SELECTOR)
    if (!item || !section) return

    event.preventDefault()
    event.stopPropagation()

    const items = section.querySelectorAll(CHANGE_ITEM_SELECTOR)
    if (items.length === 1) animateRemoval(section, button, { wholeSection: true })
    else animateRemoval(item, button)
  }, true)

  const observer = new MutationObserver((mutations) => {
    const newSections = new Set()
    const newItems = new Set()

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

        if (node.matches(CHANGE_SECTION_SELECTOR)) newSections.add(node)
        node.querySelectorAll?.(CHANGE_SECTION_SELECTOR).forEach((section) => newSections.add(section))

        if (node.matches(CHANGE_ITEM_SELECTOR)) newItems.add(node)
        node.querySelectorAll?.(CHANGE_ITEM_SELECTOR).forEach((item) => newItems.add(item))
      }
    }

    for (const section of newSections) animateSectionIn(section)
    for (const item of newItems) {
      const section = item.closest(CHANGE_SECTION_SELECTOR)
      if (!newSections.has(section)) animateItemIn(item)
    }
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class'],
  })
})()
