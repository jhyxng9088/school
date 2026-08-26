(() => {
  const SHEET_SELECTOR = '.timetable-page .change-editor'
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
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
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    body.style.overflow = ''
    delete body.dataset.schoolSheetScrollY
    window.scrollTo(0, scrollY)
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
      return Math.max(sheet.offsetHeight + 24, window.innerHeight * 0.42)
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

    function springTo(target, options = {}) {
      stopAnimation()
      const onComplete = options.onComplete
      if (Number.isFinite(options.velocity)) state.velocity = options.velocity

      if (reducedMotion.matches) {
        state.y = target
        state.velocity = 0
        paint()
        onComplete?.()
        return
      }

      const isClosing = target > 0
      const stiffness = isClosing ? 126 : 148
      const damping = isClosing ? 26 : 27
      const mass = 1

      function step(time) {
        if (!state.lastFrame) state.lastFrame = time
        const dt = Math.min((time - state.lastFrame) / 1000, 0.028)
        state.lastFrame = time

        const displacement = state.y - target
        const springForce = -stiffness * displacement
        const dampingForce = -damping * state.velocity
        const acceleration = (springForce + dampingForce) / mass

        state.velocity += acceleration * dt
        state.y += state.velocity * dt

        if (!isClosing && state.y < 0) {
          state.y = 0
          state.velocity = 0
        }

        paint()

        if (isClosing && state.y >= visualExitY()) {
          state.frame = null
          state.lastFrame = 0
          onComplete?.()
          return
        }

        const settled = Math.abs(state.y - target) < 0.7 && Math.abs(state.velocity) < 5
        if (settled) {
          state.y = target
          state.velocity = 0
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

      springTo(closedY(), {
        velocity: Math.max(velocity, 340),
        onComplete: () => finishNativeAction(button),
      })
    }

    function settleOpen(velocity = state.velocity) {
      state.closing = false
      springTo(0, { velocity: Math.min(velocity, 520) })
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
      if (event.key === 'Escape') requestClose(closeButton, 340)
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

    dragSurface.addEventListener('pointerdown', onPointerDown)
    dragSurface.addEventListener('pointermove', onPointerMove)
    dragSurface.addEventListener('pointerup', onPointerEnd)
    dragSurface.addEventListener('pointercancel', onPointerEnd)
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
