(() => {
  const SHEET_SELECTOR = '.todo-sheet'
  const OPEN_FRAME_COUNT = 2
  const CLOSE_MS = 320
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
    if (!sheet || sheet.dataset.reminderSheetReady === 'true') return

    // Remove the shared-sheet hook synchronously so the timetable spring engine
    // never takes ownership of this reminder modal.
    sheet.removeAttribute('data-school-sheet')
    sheet.dataset.reminderSheetReady = 'true'
    sheet.classList.add('reminder-sheet-managed')

    enhancePicker(sheet.querySelector('input[type="date"]'), formatDate)
    enhancePicker(sheet.querySelector('input[type="time"]'), formatTime)

    const backdrop = createBackdrop()
    const actions = findActions(sheet)
    let closing = false
    let closeTimer = null

    function cleanup() {
      if (closeTimer) window.clearTimeout(closeTimer)
      document.removeEventListener('keydown', onKeyDown)
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
      sheet.classList.remove('is-open')
      sheet.classList.add('is-closing')
      backdrop.classList.remove('is-open')
      backdrop.classList.add('is-closing')

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        passthrough(button)
        return
      }

      closeTimer = window.setTimeout(() => passthrough(button), CLOSE_MS)
    }

    function onBackdropClick() {
      close(actions.cancel)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') close(actions.cancel)
    }

    backdrop.addEventListener('click', onBackdropClick)
    document.addEventListener('keydown', onKeyDown)

    active = { sheet, close, cleanup }

    nextFrames(OPEN_FRAME_COUNT, () => {
      if (!sheet.isConnected || closing) return
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

  observer.observe(document.documentElement, { childList: true, subtree: true })
  const existing = document.querySelector(SHEET_SELECTOR)
  if (existing) enhance(existing)
})()
