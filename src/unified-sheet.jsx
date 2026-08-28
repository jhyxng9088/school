import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './unified-sheet.css'
import './desktop-motion.css'

const OPEN_MS = 560
const CLOSE_MS = 320
const SWIPE_VELOCITY = 1150
const SWIPE_MIN_DISTANCE = 48

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
  const sheetRef = useRef(null)
  const backdropRef = useRef(null)
  const closeTimerRef = useRef(null)
  const cancelOpenFramesRef = useRef(() => {})
  const dragFrameRef = useRef(0)
  const dragRef = useRef({
    active: false,
    pointerId: null,
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

  useEffect(() => () => {
    clearCloseTimer()
    cancelOpenFramesRef.current()
    cancelDragFrame()
  }, [])

  function requestClose() {
    if (closeDisabled || closing) return
    onClose?.()
  }

  function onPointerDown(event) {
    if (closeDisabled || closing || event.button > 0) return
    if (event.target.closest('button, input, select, textarea, a')) return
    const sheet = sheetRef.current
    if (!sheet) return
    const drag = dragRef.current
    drag.active = true
    drag.pointerId = event.pointerId
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
    const y = Math.max(0, event.clientY - drag.startY)
    const dt = Math.max((now - drag.lastTime) / 1000, 0.008)
    const instantVelocity = (event.clientY - drag.lastY) / dt
    drag.velocity = drag.velocity * 0.72 + instantVelocity * 0.28
    drag.lastY = event.clientY
    drag.lastTime = now
    scheduleDragPaint(y)
  }

  function finishPointer(event, cancelled = false) {
    const drag = dragRef.current
    if (!drag.active || event.pointerId !== drag.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    cancelDragFrame()
    paintDrag(drag.pendingY)

    if (cancelled) {
      clearDrag()
      return
    }

    const threshold = Math.min(Math.max(drag.height * 0.24, 104), 170)
    const velocityClose = drag.y >= SWIPE_MIN_DISTANCE && drag.velocity > SWIPE_VELOCITY
    const shouldClose = drag.y >= threshold || velocityClose

    drag.active = false
    drag.pointerId = null
    sheetRef.current?.classList.remove('is-dragging')

    if (shouldClose) requestClose()
    else clearDrag()
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
        className={`unified-school-sheet ${stateClass} ${className}`.trim()}
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
        <div className="unified-sheet-scroll">{children}</div>
      </section>
    </>,
    document.body,
  )
}
