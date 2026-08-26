from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)


# Stop loading the two legacy sheet CSS layers. UnifiedBottomSheet owns modal behavior now.
p = 'index.html'
t = read(p)
t = once(t, '    <link rel="stylesheet" href="./school-sheet.css" />\n', '', 'legacy timetable sheet css link')
t = once(t, '    <link rel="stylesheet" href="./reminder-sheet.css" />\n', '', 'legacy reminder sheet css link')
write(p, t)


# Replace the shared sheet controller with an interrupt-safe, rAF-driven drag path.
p = 'src/unified-sheet.jsx'
write(p, r'''import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './unified-sheet.css'

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
''')


# Academic events can be explicitly marked important, and newly inserted rows animate in.
p = 'src/academic-shared.jsx'
t = read(p)
t = once(
    t,
    "function isImportantExam(event) {\n  return /중간|기말|정기시험|정기고사|지필|1차.*(시험|고사)|2차.*(시험|고사)|모의고사|전국연합|학력평가|평가원|수능|대학수학능력시험/.test(String(event?.name || event?.title || ''))\n}",
    "function isImportantExam(event) {\n  return Boolean(event?.important) || /중간|기말|정기시험|정기고사|지필|1차.*(시험|고사)|2차.*(시험|고사)|모의고사|전국연합|학력평가|평가원|수능|대학수학능력시험/.test(String(event?.name || event?.title || ''))\n}",
    'important academic detector',
)
t = once(
    t,
    "  return { id: '', title: '', startDate: today, endDate: today, detail: '' }",
    "  return { id: '', title: '', startDate: today, endDate: today, detail: '', important: false }",
    'academic empty draft',
)
t = once(
    t,
    '<div className="academic-home-item" key={group.id}>',
    '<div className={`academic-home-item ${isImportantExam(group) ? \'is-important\' : \'\'}`.trim()} key={group.id}>',
    'preview important class',
)
t = t.replace('가장 가까운 중요 시험', '가장 가까운 중요 일정')
t = once(
    t,
    "      detail: group.detail || '',\n    })",
    "      detail: group.detail || '',\n      important: Boolean(group.important),\n    })",
    'academic edit importance',
)
# Animate genuinely new rows after the initial hydration.
old = """        const previous = academicRectsRef.current.get(node.dataset.academicId)
        const current = currentRects.get(node.dataset.academicId)
        if (!previous || !current) return
        const deltaY = previous.top - current.top
"""
new = """        const previous = academicRectsRef.current.get(node.dataset.academicId)
        const current = currentRects.get(node.dataset.academicId)
        if (!current) return
        if (!previous) {
          node.animate(
            [
              { opacity: 0, transform: 'translate3d(0, 7px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'none' },
          )
          return
        }
        const deltaY = previous.top - current.top
"""
t = once(t, old, new, 'academic insert animation')
# Add the importance control to the shared modal.
old = """              <label className="change-field full">
                <span>메모 · 선택</span>
                <input value={draft.detail} onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value.slice(0, 500) }))} placeholder="메모" autoComplete="off" />
              </label>

              {error ? <p className="change-warning academic-save-error">{error}</p> : null}
"""
new = """              <label className="change-field full">
                <span>메모 · 선택</span>
                <input value={draft.detail} onChange={(event) => setDraft((current) => ({ ...current, detail: event.target.value.slice(0, 500) }))} placeholder="메모" autoComplete="off" />
              </label>

              <button
                className={`academic-important-toggle ${draft.important ? 'is-selected' : ''}`.trim()}
                type="button"
                aria-pressed={draft.important}
                onClick={() => setDraft((current) => ({ ...current, important: !current.important }))}
              >
                <span>
                  <strong>중요 일정</strong>
                  <small>시험 일정처럼 강조해서 표시</small>
                </span>
                <i aria-hidden="true" />
              </button>

              {error ? <p className="change-warning academic-save-error">{error}</p> : null}
"""
t = once(t, old, new, 'academic importance control')
write(p, t)


# Persist the custom important flag in shared academic events.
p = 'src/class-activity.js'
t = read(p)
t = once(
    t,
    "    detail: String(value.detail || '').trim().slice(0, 500),\n    createdAt:",
    "    detail: String(value.detail || '').trim().slice(0, 500),\n    important: Boolean(value.important),\n    createdAt:",
    'safe academic importance',
)
t = once(
    t,
    "      detail: input?.detail,\n      createdAt:",
    "      detail: input?.detail,\n      important: Boolean(input?.important),\n      createdAt:",
    'save academic importance',
)
write(p, t)


# Firestore remains backwards compatible with older docs/clients while accepting `important`.
p = 'firestore.rules'
t = read(p)
t = once(
    t,
    "          'id', 'title', 'startDate', 'endDate', 'detail', 'createdAt', 'updatedAt',\n          'creatorStudentKey',",
    "          'id', 'title', 'startDate', 'endDate', 'detail', 'important', 'createdAt', 'updatedAt',\n          'creatorStudentKey',",
    'academic allowed keys importance',
)
t = once(
    t,
    "        && request.resource.data.detail is string\n        && request.resource.data.detail.size() <= 500\n        && request.resource.data.createdAt is int",
    "        && request.resource.data.detail is string\n        && request.resource.data.detail.size() <= 500\n        && (!request.resource.data.keys().hasAny(['important']) || request.resource.data.important is bool)\n        && request.resource.data.createdAt is int",
    'academic importance validation',
)
write(p, t)


# Keep academic field styling, but explicitly disable its retired private sheet animation on the unified sheet.
p = 'src/academic-shared.css'
t = read(p)
t += r'''

/* Unified sheet owns all modal motion. Academic CSS only owns academic content. */
body .unified-school-sheet.academic-editor,
body .unified-school-sheet.academic-editor.is-open,
body .unified-school-sheet.academic-editor.is-closing {
  animation: none !important;
}

.academic-important-toggle {
  grid-column: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  min-height: 58px;
  padding: 9px 12px 9px 14px;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: var(--surface-soft);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.academic-important-toggle > span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.academic-important-toggle strong {
  font-size: 12.5px;
  font-weight: 720;
}

.academic-important-toggle small {
  color: var(--text-tertiary);
  font-size: 10.5px;
  font-weight: 560;
}

.academic-important-toggle > i {
  position: relative;
  flex: none;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, var(--surface));
  transition: background 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.academic-important-toggle > i::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.academic-important-toggle.is-selected {
  border-color: color-mix(in srgb, var(--text) 20%, var(--border));
}

.academic-important-toggle.is-selected > i {
  background: var(--text);
}

.academic-important-toggle.is-selected > i::after {
  transform: translateX(16px);
  background: var(--bg);
}
'''
write(p, t)
