import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './unified-sheet.css'

const OPEN_MS = 560
const CLOSE_MS = 320

function nextFrame(callback) {
  const first = window.requestAnimationFrame(() => {
    const second = window.requestAnimationFrame(callback)
    callback._secondFrame = second
  })
  callback._firstFrame = first
}

function cancelNextFrame(callback) {
  if (callback._firstFrame) window.cancelAnimationFrame(callback._firstFrame)
  if (callback._secondFrame) window.cancelAnimationFrame(callback._secondFrame)
  callback._firstFrame = 0
  callback._secondFrame = 0
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
  const openFrameRef = useRef(() => setVisualOpen(true))
  const dragRef = useRef({ active: false, pointerId: null, startY: 0, y: 0, lastY: 0, lastTime: 0, velocity: 0 })

  useEffect(() => {
    const openFrame = openFrameRef.current
    cancelNextFrame(openFrame)
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    if (open) {
      setRendered(true)
      setClosing(false)
      nextFrame(openFrame)
      return () => cancelNextFrame(openFrame)
    }

    if (rendered) {
      setClosing(true)
      setVisualOpen(false)
      closeTimerRef.current = window.setTimeout(() => {
        setRendered(false)
        setClosing(false)
        closeTimerRef.current = null
      }, CLOSE_MS)
    }

    return () => cancelNextFrame(openFrame)
  }, [open, rendered])

  useEffect(() => {
    if (!rendered) return undefined
    const body = document.body
    const root = document.documentElement
    const android = /Android|SamsungBrowser/i.test(navigator.userAgent)
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
    if (android) {
      root.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      body.style.overscrollBehavior = 'none'
    } else {
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      body.style.overflow = 'hidden'
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
      if (!android) window.scrollTo(0, scrollY)
    }
  }, [rendered])

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    cancelNextFrame(openFrameRef.current)
  }, [])

  function requestClose() {
    if (closeDisabled || closing) return
    onClose?.()
  }

  function paintDrag(y) {
    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    if (!sheet) return
    const clamped = Math.max(0, y)
    dragRef.current.y = clamped
    sheet.style.setProperty('--unified-sheet-drag-y', `${clamped}px`)
    if (backdrop) {
      const height = Math.max(sheet.offsetHeight, 1)
      const progress = Math.min(clamped / height, 1)
      backdrop.style.setProperty('--unified-backdrop-drag-opacity', String(1 - progress * 0.72))
    }
  }

  function resetDrag() {
    dragRef.current.active = false
    dragRef.current.pointerId = null
    dragRef.current.velocity = 0
    sheetRef.current?.classList.remove('is-dragging')
    paintDrag(0)
  }

  function onPointerDown(event) {
    if (closeDisabled || closing || event.button > 0) return
    if (event.target.closest('button, input, select, textarea, a')) return
    const drag = dragRef.current
    drag.active = true
    drag.pointerId = event.pointerId
    drag.startY = event.clientY
    drag.y = 0
    drag.lastY = event.clientY
    drag.lastTime = performance.now()
    drag.velocity = 0
    sheetRef.current?.classList.add('is-dragging')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    const drag = dragRef.current
    if (!drag.active || event.pointerId !== drag.pointerId) return
    const now = performance.now()
    const y = Math.max(0, event.clientY - drag.startY)
    const dt = Math.max((now - drag.lastTime) / 1000, 0.001)
    drag.velocity = (event.clientY - drag.lastY) / dt
    drag.lastY = event.clientY
    drag.lastTime = now
    paintDrag(y)
  }

  function finishPointer(event, cancelled = false) {
    const drag = dragRef.current
    if (!drag.active || event.pointerId !== drag.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const sheet = sheetRef.current
    const threshold = Math.min(Math.max((sheet?.offsetHeight || 0) * 0.22, 92), 150)
    const shouldClose = !cancelled && (drag.y >= threshold || drag.velocity > 680)
    if (shouldClose) {
      drag.active = false
      drag.pointerId = null
      sheet?.classList.remove('is-dragging')
      requestClose()
    } else {
      resetDrag()
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
        className={`unified-school-sheet ${stateClass} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        style={{ '--unified-sheet-open-ms': `${OPEN_MS}ms`, '--unified-sheet-close-ms': `${CLOSE_MS}ms` }}
      >
        <div
          className="unified-sheet-head change-editor-head"
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
