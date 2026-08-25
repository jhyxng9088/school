(() => {
  const SHEET_SELECTOR = '.todo-sheet'
  const OPEN_FRAME_COUNT = 2
  const CLOSE_MS = 320
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')
  let active = null

  function formatDate(value) {
    const [year, month, day] = String(value || '').split('-').map(Number)
    if (!year || !month || !day) return '날짜 선택'
    return `${month}월 ${day}일`
  }

  function formatTime(value) {
    if (!value) return '시간 선택'
    const [hour, minute] = String(value).split(':').map(Number)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '시간 선택'
    const period = hour < 12 ? '오전' : '오후'
    const displayHour = hour % 12 || 12
    return `${period} ${displayHour}:${String(minute).padStart(2, '0')}`
  }

  function enhancePicker(input, formatter) {
    const field = input?.closest('.change-field')
    if (!input || !field || field.dataset.reminderPickerReady === 'true') return

    field.dataset.reminderPickerReady = 'true'
    field.classList.add('reminder-picker-field')

    const display = document.createElement('span')
    display.className = 'reminder-picker-display'
    display.setAttribute('aria-hidden', 'true')
    input.before(display)

    const sync = () => {
      display.textContent = formatter(input.value)
    }

    input.addEventListener('input', sync)
    input.addEventListener('change', sync)
    sync()
  }

  function findActions(sheet) {
    const row = sheet.querySelector('.change-submit-row')
    const buttons = row?.querySelectorAll('button') || []
    return {
      cancel: buttons[0] || null,
      save: sheet.querySelector('.save-change') || buttons[1] || null,
      remove: sheet.querySelector('.todo-delete-button') || null,
    }
  }

  function createBackdrop() {
    const backdrop = document.createElement('div')
    backdrop.className = 'reminder-sheet-backdrop'
    backdrop.setAttribute('aria-hidden', 'true')
    document.body.appendChild(backdrop)
    return backdrop
  }

  function nextFrames(count, callback) {
    if (count <= 0) {
      callback()
      return
    }
    requestAnimationFrame(() => nextFrames(count - 1, callback))
  }

  function enhance(sheet) {
    if (!sheet) return

    // React can restore this declarative attribute on any state rerender.
    // Strip it every time before checking our own ready flag so the shared
    // timetable sheet engine can never take ownership of a reminder sheet.
    sheet.removeAttribute('data-school-sheet')

    if (sheet.dataset.reminderSheetReady === 'true') return

    if (active && active.sheet !== sheet) active.cleanup()

    sheet.dataset.reminderSheetReady = 'true'
    sheet.classList.add('reminder-sheet-managed')

    enhancePicker(sheet.querySelector('input[type="date"]'), formatDate)
    enhancePicker(sheet.querySelector('input[type="time"]'), formatTime)

    const backdrop = createBackdrop()
    const actions = findActions(sheet)
    const dragSurface = sheet.querySelector('.change-editor-head') || sheet
    let closing = false
    let closeTimer = null

    const drag = {
      active: false,
      pointerId: null,
      startY: 0,
      lastY: 0,
      lastTime: 0,
      velocity: 0,
      y: 0,
    }

    function paintDrag(y) {
      drag.y = Math.max(0, y)
      sheet.style.setProperty('--reminder-drag-y', `${drag.y}px`)

      const travel = Math.max(sheet.offsetHeight * 0.82, 260)
      const progress = Math.min(drag.y / travel, 1)
      backdrop.style.opacity = String(Math.max(0.2, 1 - progress * 0.72))
    }

    function settleDrag() {
      if (closing) return
      drag.active = false
      drag.pointerId = null
      sheet.classList.remove('is-dragging')
      void sheet.offsetHeight
      sheet.style.setProperty('--reminder-drag-y', '0px')
      backdrop.style.opacity = ''
    }

    function cleanup() {
      if (closeTimer) window.clearTimeout(closeTimer)
      document.removeEventListener('keydown', onKeyDown)
      dragSurface.removeEventListener('pointerdown', onPointerDown)
      dragSurface.removeEventListener('pointermove', onPointerMove)
      dragSurface.removeEventListener('pointerup', onPointerEnd)
      dragSurface.removeEventListener('pointercancel', onPointerCancel)
      backdrop.removeEventListener('click', onBackdropClick)
      backdrop.remove()
      if (active?.sheet === sheet) active = null
    }

    function passthrough(button) {
      cleanup()
      if (!button || !button.isConnected) return
      button.dataset.reminderSheetPassthrough = 'true'
      button.click()
      queueMicrotask(() => delete button.dataset.reminderSheetPassthrough)
    }

    function close(button = actions.cancel) {
      if (closing) return
      closing = true
      drag.active = false
      drag.pointerId = null
      sheet.classList.remove('is-dragging')
      sheet.classList.remove('is-open')
      sheet.classList.add('is-closing')
      backdrop.classList.remove('is-open')
      backdrop.classList.add('is-closing')
      backdrop.style.opacity = ''

      if (REDUCED_MOTION.matches) {
        passthrough(button)
        return
      }

      closeTimer = window.setTimeout(() => passthrough(button), CLOSE_MS)
    }

    function onPointerDown(event) {
      if (closing || REDUCED_MOTION.matches || event.button > 0) return
      if (event.target.closest('button, input, select, textarea, a')) return

      drag.active = true
      drag.pointerId = event.pointerId
      drag.startY = event.clientY - drag.y
      drag.lastY = event.clientY
      drag.lastTime = performance.now()
      drag.velocity = 0
      sheet.classList.add('is-dragging')
      dragSurface.setPointerCapture?.(event.pointerId)
    }

    function onPointerMove(event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return

      const now = performance.now()
      const dt = Math.max((now - drag.lastTime) / 1000, 0.001)
      const nextY = Math.max(0, event.clientY - drag.startY)
      drag.velocity = (event.clientY - drag.lastY) / dt
      drag.lastY = event.clientY
      drag.lastTime = now
      paintDrag(nextY)
    }

    function finishPointer(event, cancelled = false) {
      if (!drag.active || event.pointerId !== drag.pointerId) return

      const pointerId = drag.pointerId
      dragSurface.releasePointerCapture?.(pointerId)

      const threshold = Math.min(Math.max(sheet.offsetHeight * 0.22, 90), 150)
      const shouldClose = !cancelled && (drag.y >= threshold || drag.velocity > 680)

      if (shouldClose) close(actions.cancel)
      else settleDrag()
    }

    function onPointerEnd(event) {
      finishPointer(event, false)
    }

    function onPointerCancel(event) {
      finishPointer(event, true)
    }

    function onBackdropClick() {
      close(actions.cancel)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') close(actions.cancel)
    }

    dragSurface.addEventListener('pointerdown', onPointerDown)
    dragSurface.addEventListener('pointermove', onPointerMove)
    dragSurface.addEventListener('pointerup', onPointerEnd)
    dragSurface.addEventListener('pointercancel', onPointerCancel)
    backdrop.addEventListener('click', onBackdropClick)
    document.addEventListener('keydown', onKeyDown)

    active = { sheet, close, cleanup }

    nextFrames(OPEN_FRAME_COUNT, () => {
      if (!sheet.isConnected || closing) return
      sheet.style.setProperty('--reminder-drag-y', '0px')
      sheet.classList.add('is-open')
      backdrop.classList.add('is-open')
    })
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (!button) return
    const sheet = button.closest(SHEET_SELECTOR)
    if (!sheet || !active || active.sheet !== sheet) return
    if (button.dataset.reminderSheetPassthrough === 'true') return

    const actions = findActions(sheet)
    const shouldClose = button === actions.cancel || button === actions.save || button === actions.remove
    if (!shouldClose) return
    if (button === actions.save && button.disabled) return

    event.preventDefault()
    event.stopPropagation()
    active.close(button)
  }, true)

  const observer = new MutationObserver(() => {
    const sheet = document.querySelector(SHEET_SELECTOR)
    if (sheet) enhance(sheet)
    else if (active) active.cleanup()
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-school-sheet'],
  })
  const existing = document.querySelector(SHEET_SELECTOR)
  if (existing) enhance(existing)
})()
