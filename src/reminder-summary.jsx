import { useEffect, useRef, useState } from 'react'
import './reminder-summary.css'

const ACCEPTED_FILES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
  '.heic',
  '.heif',
  'application/pdf',
  '.pdf',
  'text/plain',
  '.txt',
  'text/csv',
  '.csv',
  'text/rtf',
  '.rtf',
  'application/json',
  '.json',
  'text/html',
  '.html',
  'text/xml',
  '.xml',
].join(',')

function fileSizeLabel(size) {
  const bytes = Number(size || 0)
  if (!bytes) return ''
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))}KB`
  return `${(bytes / 1_000_000).toFixed(1)}MB`
}

export const REMINDER_ATTACHMENT_MANIFEST_HEADING = '\u2063school-attachments\u2063'
export const REMINDER_SUMMARY_PENDING_HEADING = '\u2063school-summary-pending\u2063'

export function withAttachmentManifest(summary, files) {
  const source = summary && typeof summary === 'object' ? summary : {}
  const sections = Array.isArray(source.sections)
    ? source.sections.filter((section) => section?.heading !== REMINDER_ATTACHMENT_MANIFEST_HEADING).slice(0, 13)
    : []
  const items = (files || []).slice(0, 4).map((file, index) => JSON.stringify({
    key: `a${index}`,
    name: String(file?.name || `첨부 ${index + 1}`).slice(0, 120),
  }))
  if (items.length) sections.push({ heading: REMINDER_ATTACHMENT_MANIFEST_HEADING, items })
  return {
    overview: String(source.overview || '').slice(0, 2400),
    sections,
  }
}

export function createPendingReminderSummary(files = []) {
  return withAttachmentManifest({
    overview: '',
    sections: [{ heading: REMINDER_SUMMARY_PENDING_HEADING, items: ['pending'] }],
  }, files)
}

export function isReminderSummaryPending(summary) {
  const sections = Array.isArray(summary?.sections) ? summary.sections : []
  return sections.some((section) => section?.heading === REMINDER_SUMMARY_PENDING_HEADING)
}

function attachmentManifest(todo) {
  const sections = Array.isArray(todo?.summary?.sections) ? todo.summary.sections : []
  const manifest = sections.find((section) => section?.heading === REMINDER_ATTACHMENT_MANIFEST_HEADING)
  if (manifest && Array.isArray(manifest.items)) {
    const entries = manifest.items.map((item) => {
      try {
        const parsed = JSON.parse(String(item || ''))
        const key = String(parsed?.key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
        const name = String(parsed?.name || '').trim().slice(0, 120)
        return key && name ? { key, name } : null
      } catch {
        return null
      }
    }).filter(Boolean)
    if (entries.length) return entries
  }
  return todo?.attachment?.name ? [{ key: '', name: String(todo.attachment.name).slice(0, 120) }] : []
}

export function AttachmentPicker({ files = [], busy = false, ready = false, error = '', onAdd, onRemove, onRetry = () => {} }) {
  const inputRef = useRef(null)
  const selected = Array.isArray(files) ? files.slice(0, 4) : []

  function chooseFile() {
    if (selected.length >= 4) return
    inputRef.current?.click()
  }

  function handleChange(event) {
    const nextFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (nextFiles.length) onAdd?.(nextFiles)
  }

  return (
    <section className={`reminder-attachment-picker ${selected.length ? 'has-file' : ''}`}>
      <input
        ref={inputRef}
        className="reminder-file-input"
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        onChange={handleChange}
        tabIndex={-1}
      />

      {selected.length ? (
        <div className="reminder-attachment-list">
          {selected.map((file, index) => (
            <div className="reminder-attachment-selected" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              <div>
                <span>첨부 {index + 1}</span>
                <strong>{file.name}</strong>
                <small>{fileSizeLabel(file.size)}</small>
              </div>
              <div className="reminder-attachment-actions">
                <button type="button" onClick={() => onRemove?.(index)}>제거</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {selected.length < 4 ? (
        <button className="reminder-attachment-add" type="button" onClick={chooseFile}>
          {selected.length ? '사진 또는 파일 더 추가' : '사진 또는 파일 추가'}
        </button>
      ) : (
        <small className="reminder-attachment-limit">첨부는 최대 4개까지 가능해.</small>
      )}

      {selected.length && (error || ready || busy) ? (
        <div className={`reminder-attachment-status ${error ? 'is-error' : ready ? 'is-ready' : 'is-working'}`} aria-live="polite">
          <span>{error ? error : ready ? `${selected.length}개 분석 완료` : `${selected.length}개 분석 중`}</span>
          {error ? (
            <button className="reminder-attachment-retry" type="button" onClick={onRetry}>다시 분석</button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function base64ToBlob(dataBase64, mimeType) {
  const binary = window.atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' })
}

function OriginalImageViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    setSaving(false)
    setClosing(false)
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [original?.url])

  function requestClose() {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, 280)
  }

  async function saveOriginal() {
    if (!original?.blob || saving) return
    setSaving(true)
    try {
      const file = new File([original.blob], original.name || '원본 사진', { type: original.blob.type || 'image/jpeg' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: original.name || '원본 사진' })
        return
      }
      const anchor = document.createElement('a')
      anchor.href = original.url
      anchor.download = original.name || '원본-사진'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Original image save failed:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!original) return null
  const isImage = String(original.mimeType || original.blob?.type || '').startsWith('image/')

  return (
    <div className={`reminder-original-viewer ${closing ? 'is-closing' : ''}`.trim()} role="dialog" aria-modal="true" aria-label="원본 파일">
      <button className="reminder-original-backdrop" type="button" aria-label="원본 파일 닫기" onClick={requestClose} />
      <div className="reminder-original-panel">
        <header>
          <strong>{original.name || '원본 사진'}</strong>
          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={requestClose}>×</button>
        </header>
        {isImage ? (
          <div className="reminder-original-image-wrap">
            <img src={original.url} alt={original.name || '원본 사진'} />
          </div>
        ) : (
          <div className="reminder-original-file-info">
            <strong>{original.name || '원본 파일'}</strong>
            <span>{fileSizeLabel(original.size)}{original.mimeType ? ` · ${original.mimeType}` : ''}</span>
          </div>
        )}
        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>
          {saving ? '준비 중…' : '원본 저장'}
        </button>
      </div>
    </div>
  )
}

export function SummarySheet({ todo, onClose, loadOriginal = null }) {
  const sheetRef = useRef(null)
  const backdropRef = useRef(null)
  const scrollRef = useRef(null)
  const animationRef = useRef(null)
  const lastFrameRef = useRef(0)
  const yRef = useRef(0)
  const velocityRef = useRef(0)
  const dragRef = useRef(null)
  const pullRef = useRef(null)
  const objectUrlRef = useRef('')
  const [expanded, setExpanded] = useState(false)
  const [viewer, setViewer] = useState(null)
  const [originalState, setOriginalState] = useState('idle')
  const [originalError, setOriginalError] = useState('')

  const sections = Array.isArray(todo?.summary?.sections) ? todo.summary.sections : []
  const visibleSections = sections.filter((section) => section?.heading !== REMINDER_ATTACHMENT_MANIFEST_HEADING && section?.heading !== REMINDER_SUMMARY_PENDING_HEADING)
  const originalEntries = attachmentManifest(todo)
  const canShowOriginal = Boolean(originalEntries.length && loadOriginal)

  function collapsedY() {
    return Math.max(220, Math.min(window.innerHeight * 0.4, 430))
  }

  function closedY() {
    return Math.max(window.innerHeight + 48, (sheetRef.current?.offsetHeight || window.innerHeight) + 36)
  }

  function paint(value) {
    yRef.current = value
    const sheet = sheetRef.current
    if (sheet) sheet.style.setProperty('--summary-y', `${value}px`)
    const backdrop = backdropRef.current
    if (backdrop) {
      const progress = clamp(value / Math.max(closedY(), 1), 0, 1)
      backdrop.style.opacity = String((1 - progress) * 0.32)
    }
  }

  function stopAnimation() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    lastFrameRef.current = 0
  }

  function springTo(target, { velocity = velocityRef.current, onComplete = null } = {}) {
    stopAnimation()
    velocityRef.current = Number.isFinite(velocity) ? velocity : 0
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      velocityRef.current = 0
      paint(target)
      onComplete?.()
      return
    }

    const closing = target >= closedY() - 2
    const stiffness = closing ? 126 : 148
    const damping = closing ? 26 : 27

    function step(time) {
      if (!lastFrameRef.current) lastFrameRef.current = time
      const dt = Math.min((time - lastFrameRef.current) / 1000, 0.028)
      lastFrameRef.current = time
      const displacement = yRef.current - target
      const acceleration = -stiffness * displacement - damping * velocityRef.current
      velocityRef.current += acceleration * dt
      const next = yRef.current + velocityRef.current * dt
      paint(target === 0 ? Math.max(0, next) : next)

      const settled = Math.abs(yRef.current - target) < 0.7 && Math.abs(velocityRef.current) < 5
      if (settled || (closing && yRef.current >= window.innerHeight)) {
        paint(target)
        velocityRef.current = 0
        animationRef.current = null
        lastFrameRef.current = 0
        onComplete?.()
        return
      }
      animationRef.current = requestAnimationFrame(step)
    }

    animationRef.current = requestAnimationFrame(step)
  }

  function settleCollapsed(velocity = velocityRef.current) {
    setExpanded(false)
    springTo(collapsedY(), { velocity })
  }

  function settleExpanded(velocity = velocityRef.current) {
    setExpanded(true)
    springTo(0, { velocity })
  }

  function requestClose(velocity = velocityRef.current) {
    springTo(closedY(), {
      velocity: Math.max(velocity, 340),
      onComplete: onClose,
    })
  }

  useEffect(() => {
    if (!todo?.summary) return undefined
    setExpanded(false)
    setOriginalState('idle')
    setOriginalError('')
    setViewer(null)
    dragRef.current = null
    pullRef.current = null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const start = closedY()
    paint(start)
    requestAnimationFrame(() => springTo(collapsedY(), { velocity: 0 }))

    return () => {
      stopAnimation()
      document.body.style.overflow = previousOverflow
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ''
    }
  }, [todo?.id])

  if (!todo?.summary) return null

  function pointerDown(event) {
    if (event.button > 0 || event.target.closest('button, a, input, textarea, select')) return
    if (expanded && event.target.closest('.reminder-summary-scroll')) return
    stopAnimation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startSheetY: yRef.current,
      lastY: event.clientY,
      lastTime: performance.now(),
      startedExpanded: expanded,
    }
    velocityRef.current = 0
    sheetRef.current?.classList.add('is-dragging')
  }

  function pointerMove(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const now = performance.now()
    const delta = event.clientY - drag.startY
    const next = drag.startedExpanded
      ? clamp(drag.startSheetY + Math.max(0, delta), 0, closedY())
      : clamp(drag.startSheetY + delta, 0, closedY())
    const dt = Math.max((now - drag.lastTime) / 1000, 0.001)
    velocityRef.current = (event.clientY - drag.lastY) / dt
    drag.lastY = event.clientY
    drag.lastTime = now
    paint(next)
  }

  function finishDrag(startedExpanded) {
    sheetRef.current?.classList.remove('is-dragging')
    const y = yRef.current
    const velocity = velocityRef.current
    const collapsed = collapsedY()
    if (startedExpanded) {
      if (y > collapsed + 150 || velocity > 1100) requestClose(velocity)
      else if (y > 70 || velocity > 480) settleCollapsed(velocity)
      else settleExpanded(velocity)
    } else if (y < collapsed - 70 || velocity < -520) {
      settleExpanded(velocity)
    } else if (y > collapsed + 105 || velocity > 720) {
      requestClose(velocity)
    } else {
      settleCollapsed(velocity)
    }
  }

  function pointerEnd(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    finishDrag(drag.startedExpanded)
  }

  function scrollTouchStart(event) {
    if (!expanded || event.touches.length !== 1) return
    const touch = event.touches[0]
    pullRef.current = {
      startY: touch.clientY,
      lastY: touch.clientY,
      lastTime: performance.now(),
      active: false,
    }
  }

  function scrollTouchMove(event) {
    const pull = pullRef.current
    if (!expanded || !pull || event.touches.length !== 1) return
    const touch = event.touches[0]
    const delta = touch.clientY - pull.startY
    if (!pull.active) {
      if ((scrollRef.current?.scrollTop || 0) > 0 || delta <= 10) return
      pull.active = true
      stopAnimation()
    }
    event.preventDefault()
    const now = performance.now()
    const dt = Math.max((now - pull.lastTime) / 1000, 0.001)
    velocityRef.current = (touch.clientY - pull.lastY) / dt
    pull.lastY = touch.clientY
    pull.lastTime = now
    paint(clamp(delta, 0, closedY()))
  }

  function scrollTouchEnd() {
    const pull = pullRef.current
    pullRef.current = null
    if (pull?.active) finishDrag(true)
  }

  async function openOriginal(entry) {
    if (!loadOriginal || originalState === 'loading') return
    setOriginalState('loading')
    setOriginalError('')
    try {
      const original = await loadOriginal(entry?.key || '')
      const blob = base64ToBlob(original.dataBase64, original.mimeType)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setViewer({ ...original, blob, url })
      setOriginalState('ready')
    } catch (error) {
      console.error('Original reminder image load failed:', error)
      setOriginalError(error?.message || '원본 사진을 불러오지 못했어.')
      setOriginalState('error')
    }
  }

  function closeViewer() {
    const url = objectUrlRef.current
    setViewer(null)
    setOriginalState('idle')
    if (url) URL.revokeObjectURL(url)
    if (objectUrlRef.current === url) objectUrlRef.current = ''
  }

  return (
    <div className="reminder-summary-layer" role="presentation">
      <button ref={backdropRef} className="reminder-summary-backdrop" type="button" aria-label="요약 닫기" onClick={() => requestClose(340)} />
      <section
        ref={sheetRef}
        className={`reminder-summary-sheet ${expanded ? 'is-expanded' : 'is-collapsed'}`}
        aria-label={`${todo.title} 요약`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        <div className="reminder-summary-grabber-wrap" aria-hidden="true">
          <span className="reminder-summary-grabber" />
        </div>

        <header className="reminder-summary-header">
          <div>
            <p>{originalEntries.length ? `첨부 · ${originalEntries.length}개` : '리마인더 요약'}</p>
            <h2>{todo.title}</h2>
          </div>
          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={() => requestClose(340)}>×</button>
        </header>

        <div
          ref={scrollRef}
          className="reminder-summary-scroll"
          onTouchStart={scrollTouchStart}
          onTouchMove={scrollTouchMove}
          onTouchEnd={scrollTouchEnd}
          onTouchCancel={scrollTouchEnd}
        >
          {todo.summary.overview ? <p className="reminder-summary-overview">{todo.summary.overview}</p> : null}
          {visibleSections.map((section, sectionIndex) => (
            <section className="reminder-summary-section" key={`${section.heading}-${sectionIndex}`}>
              <h3>{section.heading}</h3>
              <ul>
                {section.items.map((item, itemIndex) => (
                  <li key={`${sectionIndex}-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          {canShowOriginal ? (
            <div className="reminder-original-action reminder-original-list">
              {originalEntries.map((entry, index) => (
                <button type="button" onClick={() => openOriginal(entry)} disabled={originalState === 'loading'} key={`${entry.key}-${index}`}>
                  {originalState === 'loading' ? '원본 불러오는 중…' : `원본 ${index + 1} · ${entry.name}`}
                </button>
              ))}
              {originalError ? <small>{originalError}</small> : null}
            </div>
          ) : null}
        </div>
      </section>

      {viewer ? <OriginalImageViewer key={viewer.url} original={viewer} onClose={closeViewer} /> : null}
    </div>
  )
}
