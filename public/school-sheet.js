(() => {
  const SHEET_SELECTOR = '[data-school-sheet], .change-editor'
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
    if (!sheet || sheet.dataset.schoolSheetReady === 'true') return

    if (activeController && activeController.sheet !== sheet) {
      activeController.destroy()
    }

    sheet.dataset.schoolSheetReady = 'true'
    document.documentElement.classList.add('school-sheet-open')
    lockBackground()

    const { closeButton, saveButton } = findActionButtons(sheet)
    const dragSurface = sheet.querySelector('.change-editor-head') || sheet
    const backdrop = createBackdrop()

    if (closeButton) {
      closeButton.classList.add('school-sheet-close')
      closeButton.setAttribute('aria-label', '닫기')
      closeButton.setAttribute('title', '닫기')
    }

    const state = {
      y: Math.max(sheet.offsetHeight + 56, 300),
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
      return Math.max(sheet.offsetHeight + 64, window.innerHeight * 0.48)
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
      // Opening stays overdamped, but is slightly quicker than the first version.
      const stiffness = isClosing ? 56 : 60
      const damping = isClosing ? 19 : 18.5
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

        // Opening never overshoots the resting position.
        if (!isClosing && state.y < 0) {
          state.y = 0
          state.velocity = 0
        }

        paint()

        const settled = Math.abs(state.y - target) < 0.45 && Math.abs(state.velocity) < 3.2
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
      springTo(closedY(), {
        velocity: Math.max(velocity, 200),
        onComplete: () => finishNativeAction(button),
      })
    }

    function settleOpen(velocity = state.velocity) {
      state.closing = false
      springTo(0, { velocity: Math.min(velocity, 380) })
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

      const threshold = Math.min(Math.max(sheet.offsetHeight * 0.28, 110), 180)
      const shouldClose = state.y > threshold || state.velocity > 760
      if (shouldClose) requestClose(closeButton, Math.max(state.velocity, 180))
      else settleOpen(state.velocity)
    }

    function blockBackgroundGesture(event) {
      event.preventDefault()
    }

    function onBackdropClick() {
      requestClose(closeButton, 200)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') requestClose(closeButton, 200)
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
    activeController.requestClose(target, 200)
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
