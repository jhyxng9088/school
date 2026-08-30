import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './unified-sheet.css'
import './desktop-motion.css'

const OPEN_MS = 560
const CLOSE_MS = 320
const SWIPE_VELOCITY = 1150
const SWIPE_MIN_DISTANCE = 48
const SHEET_RESIZE_MS = 420
const WHEEL_EXPAND_DISTANCE = 32
const WHEEL_COLLAPSE_DISTANCE = 48
const WHEEL_CLOSE_DISTANCE = 72
const WHEEL_IDLE_MS = 180
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, label, [contenteditable="true"], [data-sheet-gesture-ignore]'

function afterTwoFrames(callback) {
  const state = { first: 0, second: 0 }
  state.first = window.requestAnimationFrame(() => {
    state.second = window.requestAnimationFrame(callback)
  })
  return () => {
    if (state.first) window.cancelAnimationFrame(state.first)
    if (state.second) window.cancelAnimationFrame(state.second)
  }
}

function needsFixedBodyScrollLock() {
  const userAgent = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(userAgent) || (
    /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1
  )
}

export function UnifiedBottomSheet({
  open,
  onClose,
  title,
  subtitle = '',
  children,
  className = '',
  ariaLabel,
  closeDisabled = false,
}) {
  const [rendered, setRendered] = useState(Boolean(open))
  const [visualOpen, setVisualOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const sheetRef = useRef(null)
  const scrollRef = useRef(null)
  const backdropRef = useRef(null)
  const closeTimerRef = useRef(null)
  const resizeTimerRef = useRef(null)
  const cancelOpenFramesRef = useRef(() => {})
  const dragFrameRef = useRef(0)
  const expandedRef = useRef(false)
  const collapsedHeightRef = useRef(0)
  const wheelRef = useRef({ distance: 0, direction: 0, locked: false, idleTimer: null })
  const touchRef = useRef({
    active: false,
    claimed: false,
    mode: '',
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
    startedInHead: false,
  })
  const dragRef = useRef({
    active: false,
    pointerId: null,
    mode: '',
    startY: 0,
    y: 0,
    pendingY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
    height: 1,
  })

  function clearCloseTimer() {
    if (!closeTimerRef.current) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }

  function clearResizeTimer() {
    if (!resizeTimerRef.current) return
    window.clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = null
  }

  function clearWheelTimer() {
    const wheel = wheelRef.current
    if (!wheel.idleTimer) return
    window.clearTimeout(wheel.idleTimer)
    wheel.idleTimer = null
  }

  function expandedHeight() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const ratio = window.matchMedia?.('(min-width: 700px)').matches ? 0.86 : 0.88
    return Math.min(viewportHeight * ratio, 760)
  }

  function collapsedMaxHeight() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const ratio = window.matchMedia?.('(min-width: 700px)').matches ? 0.64 : 0.68
    return Math.min(viewportHeight * ratio, 560)
  }

  function collapsedHeight() {
    const sheet = sheetRef.current
    const scroll = scrollRef.current
    if (!sheet || !scroll) return collapsedHeightRef.current || 1
    const head = sheet.querySelector('.unified-sheet-head')
    const styles = window.getComputedStyle(sheet)
    const chrome = (head?.offsetHeight || 0)
      + Number.parseFloat(styles.paddingTop || '0')
      + Number.parseFloat(styles.paddingBottom || '0')
      + Number.parseFloat(styles.borderTopWidth || '0')
      + Number.parseFloat(styles.borderBottomWidth || '0')
    return Math.min(Math.ceil(chrome + scroll.scrollHeight), collapsedMaxHeight())
  }

  function setSheetHeight(value) {
    sheetRef.current?.style.setProperty('--unified-sheet-height', `${Math.max(1, value)}px`)
  }

  function settleSheetExtent(nextExpanded) {
    const sheet = sheetRef.current
    if (!sheet) return
    clearResizeTimer()
    const currentHeight = sheet.getBoundingClientRect().height
    if (!expandedRef.current && collapsedHeightRef.current <= 0) collapsedHeightRef.current = currentHeight
    setSheetHeight(currentHeight)
    expandedRef.current = nextExpanded
    setExpanded(nextExpanded)
    window.requestAnimationFrame(() => {
      const target = nextExpanded
        ? Math.max(collapsedHeightRef.current, expandedHeight())
        : collapsedHeightRef.current || collapsedHeight()
      setSheetHeight(target)
    })
    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null
      if (!expandedRef.current) sheet.style.removeProperty('--unified-sheet-height')
    }, SHEET_RESIZE_MS)
  }

  function cancelDragFrame() {
    if (!dragFrameRef.current) return
    window.cancelAnimationFrame(dragFrameRef.current)
    dragFrameRef.current = 0
  }

  function paintDrag(y) {
    const sheet = sheetRef.current
    if (!sheet) return
    const drag = dragRef.current
    const clamped = Math.max(0, y)
    drag.y = clamped
    sheet.style.setProperty('--unified-sheet-drag-y', `${clamped}px`)
    const backdrop = backdropRef.current
    if (backdrop) {
      const progress = Math.min(clamped / Math.max(drag.height, 1), 1)
      backdrop.style.setProperty('--unified-backdrop-drag-opacity', String(1 - progress * 0.68))
    }
  }

  function paintExtentDrag(deltaY, mode) {
    const collapsed = collapsedHeightRef.current || collapsedHeight()
    const expandedTarget = Math.max(collapsed, expandedHeight())
    if (mode === 'expand') {
      setSheetHeight(Math.min(expandedTarget, collapsed + Math.max(0, -deltaY) * 0.82))
      return
    }
    if (mode === 'collapse') {
      setSheetHeight(Math.max(collapsed, expandedTarget - Math.max(0, deltaY) * 0.82))
    }
  }

  function scheduleDragPaint(y) {
    dragRef.current.pendingY = Math.max(0, y)
    if (dragFrameRef.current) return
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = 0
      paintDrag(dragRef.current.pendingY)
    })
  }

  function clearDrag({ paint = true } = {}) {
    cancelDragFrame()
    const drag = dragRef.current
    drag.active = false
    drag.pointerId = null
    drag.mode = ''
    drag.velocity = 0
    drag.pendingY = 0
    sheetRef.current?.classList.remove('is-dragging')
    if (paint) paintDrag(0)
  }

  useEffect(() => {
    cancelOpenFramesRef.current()
    clearCloseTimer()

    if (open) {
      clearDrag()
      clearResizeTimer()
      expandedRef.current = false
      setExpanded(false)
      collapsedHeightRef.current = 0
      sheetRef.current?.style.removeProperty('--unified-sheet-height')
      setRendered(true)
      setClosing(false)
      setVisualOpen(false)
      cancelOpenFramesRef.current = afterTwoFrames(() => setVisualOpen(true))
      return () => cancelOpenFramesRef.current()
    }

    if (rendered) {
      clearDrag({ paint: false })
      setClosing(true)
      setVisualOpen(false)
      closeTimerRef.current = window.setTimeout(() => {
        setRendered(false)
        setClosing(false)
        closeTimerRef.current = null
      }, CLOSE_MS)
    }

    return undefined
  }, [open])

  useEffect(() => {
    if (!rendered) return undefined
    const body = document.body
    const root = document.documentElement
    const fixedBodyScrollLock = needsFixedBodyScrollLock()
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0
    const previous = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      rootOverflow: root.style.overflow,
    }

    root.classList.add('school-unified-sheet-open')
    if (fixedBodyScrollLock) {
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
    } else {
      root.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      body.style.overscrollBehavior = 'none'
    }

    return () => {
      root.classList.remove('school-unified-sheet-open')
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.left = previous.bodyLeft
      body.style.right = previous.bodyRight
      body.style.width = previous.bodyWidth
      body.style.overflow = previous.bodyOverflow
      body.style.overscrollBehavior = previous.bodyOverscroll
      root.style.overflow = previous.rootOverflow
      if (fixedBodyScrollLock) window.scrollTo(0, scrollY)
    }
  }, [rendered])

  useEffect(() => {
    if (!rendered || !visualOpen) return undefined
    const sheet = sheetRef.current
    if (!sheet) return undefined
    const rememberCollapsedHeight = () => {
      if (expandedRef.current) {
        setSheetHeight(Math.max(collapsedHeightRef.current, expandedHeight()))
        return
      }
      sheet.style.removeProperty('--unified-sheet-height')
      collapsedHeightRef.current = sheet.getBoundingClientRect().height
    }
    const frame = window.requestAnimationFrame(rememberCollapsedHeight)
    window.addEventListener('resize', rememberCollapsedHeight)
    window.visualViewport?.addEventListener('resize', rememberCollapsedHeight)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', rememberCollapsedHeight)
      window.visualViewport?.removeEventListener('resize', rememberCollapsedHeight)
    }
  }, [rendered, visualOpen])

  useEffect(() => {
    if (!rendered) return undefined
    const sheet = sheetRef.current
    const scroll = scrollRef.current
    if (!sheet || !scroll) return undefined

    function resetWheelAfterIdle() {
      const wheel = wheelRef.current
      clearWheelTimer()
      wheel.idleTimer = window.setTimeout(() => {
        wheel.distance = 0
        wheel.direction = 0
        wheel.locked = false
        wheel.idleTimer = null
      }, WHEEL_IDLE_MS)
    }

    function wheelDelta(event) {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 18
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight
      return event.deltaY
    }

    function onWheel(event) {
      if (closeDisabled || closing || event.ctrlKey) return
      const delta = wheelDelta(event)
      if (!delta) return
      resetWheelAfterIdle()
      const wheel = wheelRef.current
      if (wheel.locked) {
        if (event.cancelable) event.preventDefault()
        return
      }

      if (expandedRef.current) {
        if (delta >= 0 || scroll.scrollTop > 1) {
          wheel.distance = 0
          wheel.direction = 0
          return
        }
        if (event.cancelable) event.preventDefault()
        if (wheel.direction !== -1) wheel.distance = 0
        wheel.direction = -1
        wheel.distance += Math.abs(delta)
        if (wheel.distance >= WHEEL_COLLAPSE_DISTANCE) {
          wheel.locked = true
          settleSheetExtent(false)
        }
        return
      }

      if (event.cancelable) event.preventDefault()
      const direction = delta < 0 ? -1 : 1
      if (wheel.direction !== direction) wheel.distance = 0
      wheel.direction = direction
      wheel.distance += Math.abs(delta)
      if (direction < 0 && wheel.distance >= WHEEL_EXPAND_DISTANCE) {
        wheel.locked = true
        settleSheetExtent(true)
      } else if (direction > 0 && wheel.distance >= WHEEL_CLOSE_DISTANCE) {
        wheel.locked = true
        requestClose()
      }
    }

    function onTouchStart(event) {
      if (closeDisabled || closing || event.touches.length !== 1) return
      if (!expandedRef.current && event.target.closest(INTERACTIVE_SELECTOR)) return
      const touch = touchRef.current
      const point = event.touches[0]
      touch.active = true
      touch.claimed = false
      touch.mode = ''
      touch.startY = point.clientY
      touch.lastY = point.clientY
      touch.lastTime = performance.now()
      touch.velocity = 0
      touch.startedInHead = Boolean(event.target.closest('.unified-sheet-head'))
      if (!expandedRef.current) collapsedHeightRef.current = sheet.getBoundingClientRect().height
    }

    function onTouchMove(event) {
      const touch = touchRef.current
      if (!touch.active || event.touches.length !== 1) return
      const point = event.touches[0]
      const deltaY = point.clientY - touch.startY
      const now = performance.now()
      const dt = Math.max((now - touch.lastTime) / 1000, 0.008)
      const instantVelocity = (point.clientY - touch.lastY) / dt
      touch.velocity = touch.velocity * 0.72 + instantVelocity * 0.28
      touch.lastY = point.clientY
      touch.lastTime = now

      if (!touch.claimed) {
        if (Math.abs(deltaY) < 7) return
        if (expandedRef.current) {
          if (deltaY < 0 || (!touch.startedInHead && scroll.scrollTop > 1)) {
            touch.active = false
            return
          }
          touch.mode = 'collapse'
        } else {
          touch.mode = deltaY < 0 ? 'expand' : 'dismiss'
        }
        touch.claimed = true
        sheet.classList.add('is-dragging')
      }

      if (event.cancelable) event.preventDefault()
      if (touch.mode === 'dismiss') paintDrag(deltaY)
      else paintExtentDrag(deltaY, touch.mode)
    }

    function finishTouch(cancelled = false) {
      const touch = touchRef.current
      if (!touch.active) return
      touch.active = false
      sheet.classList.remove('is-dragging')
      if (!touch.claimed || cancelled) {
        if (touch.claimed) {
          if (expandedRef.current) setSheetHeight(Math.max(collapsedHeightRef.current, expandedHeight()))
          else sheet.style.removeProperty('--unified-sheet-height')
          paintDrag(0)
        }
        return
      }

      const distance = touch.lastY - touch.startY
      const fastEnough = Math.abs(touch.velocity) > SWIPE_VELOCITY
      if (touch.mode === 'expand' && (-distance >= SWIPE_MIN_DISTANCE || (fastEnough && touch.velocity < 0))) {
        settleSheetExtent(true)
      } else if (touch.mode === 'collapse' && (distance >= SWIPE_MIN_DISTANCE || (fastEnough && touch.velocity > 0))) {
        settleSheetExtent(false)
      } else if (touch.mode === 'dismiss') {
        const threshold = Math.min(Math.max(sheet.getBoundingClientRect().height * 0.24, 104), 170)
        if (distance >= threshold || (distance >= SWIPE_MIN_DISTANCE && touch.velocity > SWIPE_VELOCITY)) requestClose()
        else paintDrag(0)
      } else if (expandedRef.current) {
        setSheetHeight(Math.max(collapsedHeightRef.current, expandedHeight()))
      } else {
        sheet.style.removeProperty('--unified-sheet-height')
      }
      touch.claimed = false
      touch.mode = ''
    }

    const onTouchEnd = () => finishTouch(false)
    const onTouchCancel = () => finishTouch(true)

    sheet.addEventListener('wheel', onWheel, { passive: false })
    sheet.addEventListener('touchstart', onTouchStart, { passive: true })
    sheet.addEventListener('touchmove', onTouchMove, { passive: false })
    sheet.addEventListener('touchend', onTouchEnd, { passive: true })
    sheet.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      clearWheelTimer()
      sheet.removeEventListener('wheel', onWheel)
      sheet.removeEventListener('touchstart', onTouchStart)
      sheet.removeEventListener('touchmove', onTouchMove)
      sheet.removeEventListener('touchend', onTouchEnd)
      sheet.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [rendered, closeDisabled, closing])

  useEffect(() => () => {
    clearCloseTimer()
    clearResizeTimer()
    clearWheelTimer()
    cancelOpenFramesRef.current()
    cancelDragFrame()
  }, [])

  function requestClose() {
    if (closeDisabled || closing) return
    onClose?.()
  }

  function onPointerDown(event) {
    if (event.pointerType === 'touch' || closeDisabled || closing || event.button > 0) return
    if (event.target.closest('button, input, select, textarea, a')) return
    const sheet = sheetRef.current
    if (!sheet) return
    const drag = dragRef.current
    drag.active = true
    drag.pointerId = event.pointerId
    drag.mode = expandedRef.current ? 'collapse' : 'dismiss'
    drag.startY = event.clientY
    drag.y = 0
    drag.pendingY = 0
    drag.lastY = event.clientY
    drag.lastTime = performance.now()
    drag.velocity = 0
    drag.height = Math.max(sheet.getBoundingClientRect().height, 1)
    sheet.classList.add('is-dragging')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    const drag = dragRef.current
    if (!drag.active || event.pointerId !== drag.pointerId) return
    if (event.cancelable) event.preventDefault()
    const now = performance.now()
    const deltaY = event.clientY - drag.startY
    const dt = Math.max((now - drag.lastTime) / 1000, 0.008)
    const instantVelocity = (event.clientY - drag.lastY) / dt
    drag.velocity = drag.velocity * 0.72 + instantVelocity * 0.28
    drag.lastY = event.clientY
    drag.lastTime = now
    if (!expandedRef.current && deltaY < 0) drag.mode = 'expand'
    if (drag.mode === 'dismiss') scheduleDragPaint(deltaY)
    else paintExtentDrag(deltaY, drag.mode)
  }

  function finishPointer(event, cancelled = false) {
    const drag = dragRef.current
    if (!drag.active || event.pointerId !== drag.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    cancelDragFrame()
    if (drag.mode === 'dismiss') paintDrag(drag.pendingY)

    if (cancelled) {
      clearDrag()
      return
    }

    const threshold = Math.min(Math.max(drag.height * 0.24, 104), 170)
    const velocityClose = drag.y >= SWIPE_MIN_DISTANCE && drag.velocity > SWIPE_VELOCITY
    const shouldClose = drag.mode === 'dismiss' && (drag.y >= threshold || velocityClose)
    const shouldExpand = drag.mode === 'expand' && (-event.clientY + drag.startY >= SWIPE_MIN_DISTANCE || drag.velocity < -SWIPE_VELOCITY)
    const shouldCollapse = drag.mode === 'collapse' && (event.clientY - drag.startY >= SWIPE_MIN_DISTANCE || drag.velocity > SWIPE_VELOCITY)

    drag.active = false
    drag.pointerId = null
    sheetRef.current?.classList.remove('is-dragging')

    if (shouldClose) requestClose()
    else if (shouldExpand) settleSheetExtent(true)
    else if (shouldCollapse) settleSheetExtent(false)
    else {
      if (expandedRef.current) setSheetHeight(Math.max(collapsedHeightRef.current, expandedHeight()))
      else sheetRef.current?.style.removeProperty('--unified-sheet-height')
      clearDrag()
    }
  }

  if (!rendered) return null

  const stateClass = closing ? 'is-closing' : visualOpen ? 'is-open' : 'is-opening'
  return createPortal(
    <>
      <div
        ref={backdropRef}
        className={`unified-sheet-backdrop ${stateClass}`}
        aria-hidden="true"
        onClick={requestClose}
      />
      <section
        ref={sheetRef}
        className={`unified-school-sheet ${stateClass} ${expanded ? 'is-expanded' : 'is-collapsed'} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        style={{ '--unified-sheet-open-ms': `${OPEN_MS}ms`, '--unified-sheet-close-ms': `${CLOSE_MS}ms` }}
      >
        <div
          className="unified-sheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishPointer(event, false)}
          onPointerCancel={(event) => finishPointer(event, true)}
        >
          <div className="unified-sheet-title-copy">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            className="unified-sheet-close"
            type="button"
            onClick={requestClose}
            disabled={closeDisabled}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div ref={scrollRef} className="unified-sheet-scroll">{children}</div>
      </section>
    </>,
    document.body,
  )
}
