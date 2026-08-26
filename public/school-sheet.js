(() => {
  const SHEET_SELECTOR = '.timetable-page .change-editor'
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const samsungInternet = /SamsungBrowser/i.test(navigator.userAgent)
  const androidBrowser = /Android|SamsungBrowser/i.test(navigator.userAgent)
  const OPEN_MS = 560
  const CLOSE_MS = 320
  let activeController = null

  function findActionButtons(sheet) {
    const row = sheet.querySelector('.change-submit-row')
    if (!row) return { closeButton: null, saveButton: null }
    const buttons = row.querySelectorAll('button')
    return {
      closeButton: buttons[0] || null,
      saveButton: sheet.querySelector('.save-change') || buttons[1] || null,
    }
  }

  function formatDateDisplay(value) {
    const [year, month, day] = String(value || '').split('-').map(Number)
    if (!year || !month || !day) return '날짜 선택'
    const date = new Date(year, month - 1, day, 12, 0, 0, 0)
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
    return `${year}년 ${month}월 ${day}일 ${weekdays[date.getDay()]}`
  }

  function ensureDateField(sheet) {
    const input = sheet.querySelector('input[type="date"]')
    const field = input?.closest('.change-field')
    if (!input || !field) return

    field.classList.add('school-date-field')

    const sync = () => {
      field.dataset.schoolDateDisplay = formatDateDisplay(input.value)
    }

    if (input.dataset.schoolDateSync !== 'true') {
      input.dataset.schoolDateSync = 'true'
      input.addEventListener('input', sync)
      input.addEventListener('change', sync)
    }

    sync()
  }

  function createBackdrop() {
    const backdrop = document.createElement('div')
    backdrop.className = 'school-sheet-backdrop'
    backdrop.setAttribute('aria-hidden', 'true')
    document.body.appendChild(backdrop)
    return backdrop
  }

  function lockBackground() {
    const body = document.body
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0
    body.dataset.schoolSheetScrollY = String(scrollY)

    if (androidBrowser) {
      body.dataset.schoolSheetLockMode = 'overflow'
      document.documentElement.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      body.style.overscrollBehavior = 'none'
      return
    }

    body.dataset.schoolSheetLockMode = 'fixed'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
  }

  function unlockBackground() {
    const body = document.body
    const scrollY = Number(body.dataset.schoolSheetScrollY || 0)
    const lockMode = body.dataset.schoolSheetLockMode

    if (lockMode === 'overflow') {
      document.documentElement.style.overflow = ''
      body.style.overflow = ''
      body.style.overscrollBehavior = ''
    } else {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }

    delete body.dataset.schoolSheetScrollY
    delete body.dataset.schoolSheetLockMode
  }

  function enhanceSheet(sheet) {
    if (!sheet) return
    ensureDateField(sheet)
    if (sheet.dataset.schoolSheetReady === 'true') return

    if (activeController && activeController.sheet !== sheet) {
      activeController.destroy()
    }

    sheet.dataset.schoolSheetReady = 'true'
    document.documentElement.classList.add('school-sheet-open')
    lockBackground()

    const { closeButton } = findActionButtons(sheet)
    const dragSurface = sheet.querySelector('.change-editor-head') || sheet
    const backdrop = createBackdrop()

    if (closeButton) {
      closeButton.classList.add('school-sheet-close')
      closeButton.setAttribute('aria-label', '닫기')
      closeButton.setAttribute('title', '닫기')
    }

    const state = {
      y: Math.max(sheet.offsetHeight + 24, 280),
      velocity: 0,
      frame: null,
      lastFrame: 0,
      dragging: false,
      closing: false,
      pointerId: null,
      dragStartY: 0,
      dragStartSheetY: 0,
      lastPointerY: 0,
      lastPointerTime: 0,
    }

    function stopAnimation() {
      if (state.frame !== null) {
        cancelAnimationFrame(state.frame)
        state.frame = null
      }
      state.lastFrame = 0
    }

    function closedY() {
      const viewportHeight = window.visualViewport?.height || window.innerHeight
      return Math.max(sheet.offsetHeight + 24, viewportHeight * 0.42)
    }

    function visualExitY() {
      return sheet.offsetHeight + 6
    }

    function paint() {
      const maxY = Math.max(closedY(), 1)
      const progress = Math.min(Math.max(state.y / maxY, 0), 1)
      sheet.style.setProperty('--school-sheet-y', `${state.y}px`)
      sheet.style.setProperty('--school-sheet-opacity', String(1 - progress * 0.1))
      backdrop.style.opacity = String((1 - progress) * 0.32)
    }

    function finishNativeAction(button) {
      cleanupVisuals()
      if (!button || !button.isConnected) return
      button.dataset.schoolSheetPassthrough = 'true'
      button.click()
      queueMicrotask(() => delete button.dataset.schoolSheetPassthrough)
    }

    function cubicCoordinate(t, p1, p2) {
      const inverse = 1 - t
      return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t
    }

    function cubicSlope(t, p1, p2) {
      const inverse = 1 - t
      return 3 * inverse * inverse * p1 + 6 * inverse * t * (p2 - p1) + 3 * t * t * (1 - p2)
    }

    function cubicBezier(x1, y1, x2, y2) {
      return (progress) => {
        if (progress <= 0 || progress >= 1) return progress
        let t = progress
        for (let index = 0; index < 6; index += 1) {
          const slope = cubicSlope(t, x1, x2)
          if (Math.abs(slope) < 0.0001) break
          t -= (cubicCoordinate(t, x1, x2) - progress) / slope
          t = Math.min(Math.max(t, 0), 1)
        }
        return cubicCoordinate(t, y1, y2)
      }
    }

    const OPEN_EASE = cubicBezier(0.16, 1, 0.3, 1)
    const CLOSE_EASE = cubicBezier(0.4, 0, 1, 1)

    function tweenTo(target, options = {}) {
      stopAnimation()
      const onComplete = options.onComplete
      const duration = Math.max(1, Number(options.duration || OPEN_MS))
      const easing = options.easing || OPEN_EASE
      const startY = state.y
      let startTime = null
      state.velocity = 0

      if (reducedMotion.matches) {
        state.y = target
        paint()
        onComplete?.()
        return
      }

      function step(time) {
        if (startTime === null) startTime = time
        const progress = Math.min(Math.max((time - startTime) / duration, 0), 1)
        const eased = easing(progress)
        state.y = startY + (target - startY) * eased
        paint()

        if (progress >= 1) {
          state.y = target
          state.frame = null
          state.lastFrame = 0
          paint()
          onComplete?.()
          return
        }
        state.frame = requestAnimationFrame(step)
      }

      state.frame = requestAnimationFrame(step)
    }

    function requestClose(button = closeButton, velocity = state.velocity) {
      if (state.closing) return
      state.closing = true
      state.dragging = false
      sheet.classList.add('is-closing')

      if (state.y >= visualExitY()) {
        finishNativeAction(button)
        return
      }

      tweenTo(closedY(), {
        duration: CLOSE_MS,
        easing: CLOSE_EASE,
        onComplete: () => finishNativeAction(button),
      })
    }

    function settleOpen() {
      state.closing = false
      const ratio = Math.min(Math.max(state.y / Math.max(closedY(), 1), 0), 1)
      const duration = ratio > 0.72 ? OPEN_MS : Math.max(180, Math.round(OPEN_MS * ratio))
      tweenTo(0, { duration, easing: OPEN_EASE })
    }

    function onPointerDown(event) {
      if (state.closing || event.button > 0) return
      if (event.target.closest('button, input, select, textarea, a')) return

      stopAnimation()
      state.dragging = true
      state.pointerId = event.pointerId
      state.dragStartY = event.clientY
      state.dragStartSheetY = state.y
      state.lastPointerY = event.clientY
      state.lastPointerTime = performance.now()
      state.velocity = 0
      sheet.classList.add('is-dragging')
      dragSurface.setPointerCapture?.(event.pointerId)
    }

    function onPointerMove(event) {
      if (!state.dragging || event.pointerId !== state.pointerId) return
      const now = performance.now()
      const delta = Math.max(0, event.clientY - state.dragStartY)
      const nextY = Math.max(0, state.dragStartSheetY + delta)
      const dt = Math.max((now - state.lastPointerTime) / 1000, 0.001)

      state.velocity = (event.clientY - state.lastPointerY) / dt
      state.y = nextY
      state.lastPointerY = event.clientY
      state.lastPointerTime = now
      paint()
    }

    function onPointerEnd(event) {
      if (!state.dragging || event.pointerId !== state.pointerId) return
      state.dragging = false
      state.pointerId = null
      sheet.classList.remove('is-dragging')
      dragSurface.releasePointerCapture?.(event.pointerId)

      const threshold = Math.min(Math.max(sheet.offsetHeight * 0.26, 100), 165)
      const shouldClose = state.y > threshold || state.velocity > 720
      if (shouldClose) requestClose(closeButton, Math.max(state.velocity, 280))
      else settleOpen(state.velocity)
    }

    function blockBackgroundGesture(event) {
      event.preventDefault()
    }

    function onBackdropClick() {
      requestClose(closeButton, 340)
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      requestClose(closeButton, 340)
    }

    function cleanupVisuals() {
      stopAnimation()
      backdrop.removeEventListener('click', onBackdropClick)
      backdrop.removeEventListener('touchmove', blockBackgroundGesture)
      backdrop.removeEventListener('wheel', blockBackgroundGesture)
      backdrop.remove()
      document.removeEventListener('keydown', onKeyDown)
      document.documentElement.classList.remove('school-sheet-open')
      unlockBackground()
      if (activeController?.sheet === sheet) activeController = null
    }

    function destroy() {
      dragSurface.removeEventListener('pointerdown', onPointerDown)
      dragSurface.removeEventListener('pointermove', onPointerMove)
      dragSurface.removeEventListener('pointerup', onPointerEnd)
      dragSurface.removeEventListener('pointercancel', onPointerEnd)
      cleanupVisuals()
    }

    if (!samsungInternet) {
      dragSurface.addEventListener('pointerdown', onPointerDown)
      dragSurface.addEventListener('pointermove', onPointerMove)
      dragSurface.addEventListener('pointerup', onPointerEnd)
      dragSurface.addEventListener('pointercancel', onPointerEnd)
    }
    backdrop.addEventListener('click', onBackdropClick)
    backdrop.addEventListener('touchmove', blockBackgroundGesture, { passive: false })
    backdrop.addEventListener('wheel', blockBackgroundGesture, { passive: false })
    document.addEventListener('keydown', onKeyDown)

    activeController = { sheet, requestClose, destroy }
    paint()
    requestAnimationFrame(() => settleOpen(0))
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button')
    if (!target) return
    const sheet = target.closest(SHEET_SELECTOR)
    if (!sheet || !activeController || activeController.sheet !== sheet) return
    if (target.dataset.schoolSheetPassthrough === 'true') return

    const { closeButton, saveButton } = findActionButtons(sheet)
    const isClose = target === closeButton
    const isSave = target === saveButton
    if (!isClose && !isSave) return
    if (isSave && target.disabled) return

    event.preventDefault()
    event.stopPropagation()
    activeController.requestClose(target, 340)
  }, true)

  const observer = new MutationObserver(() => {
    const sheet = document.querySelector(SHEET_SELECTOR)
    if (sheet) enhanceSheet(sheet)
    else if (activeController) activeController.destroy()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
  const existing = document.querySelector(SHEET_SELECTOR)
  if (existing) enhanceSheet(existing)
})()
