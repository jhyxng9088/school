import React, { useRef, useState } from 'react'
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

export function AttachmentPicker({ file, busy = false, ready = false, error = '', onChange }) {
  const inputRef = useRef(null)

  function chooseFile() {
    inputRef.current?.click()
  }

  function handleChange(event) {
    const nextFile = event.target.files?.[0] || null
    event.target.value = ''
    if (nextFile) onChange(nextFile)
  }

  return (
    <section className={`reminder-attachment-picker ${file ? 'has-file' : ''}`}>
      <input
        ref={inputRef}
        className="reminder-file-input"
        type="file"
        accept={ACCEPTED_FILES}
        onChange={handleChange}
        tabIndex={-1}
      />

      {file ? (
        <div className="reminder-attachment-selected">
          <div>
            <span>첨부</span>
            <strong>{file.name}</strong>
            <small>{fileSizeLabel(file.size)}</small>
          </div>
          <div className="reminder-attachment-actions">
            <button type="button" onClick={chooseFile}>변경</button>
            <button type="button" onClick={() => onChange(null)}>제거</button>
          </div>
        </div>
      ) : (
        <button className="reminder-attachment-add" type="button" onClick={chooseFile}>
          사진 또는 파일 추가
        </button>
      )}

      {file ? (
        <p className={`reminder-attachment-status ${error ? 'is-error' : ready ? 'is-ready' : busy ? 'is-working' : ''}`} aria-live="polite">
          {error
            ? error
            : ready
              ? '첨부 내용을 읽고 요약까지 정리했어.'
              : busy
                ? '첨부 내용을 읽고 정리하는 중…'
                : '첨부를 분석할 준비가 됐어.'}
        </p>
      ) : (
        <p className="reminder-attachment-help">사진은 자동으로 용량을 줄여 분석하고, PDF·텍스트 파일은 2.5MB 이하를 지원해.</p>
      )}
    </section>
  )
}

export function SummarySheet({ todo, onClose }) {
  const [expanded, setExpanded] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragRef = useRef(null)

  if (!todo?.summary) return null

  function pointerDown(event) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      startY: event.clientY,
      startedExpanded: expanded,
    }
    setDragY(0)
  }

  function pointerMove(event) {
    const drag = dragRef.current
    if (!drag) return
    const delta = event.clientY - drag.startY
    const maxOffset = Math.max(140, window.innerHeight * 0.42)
    if (drag.startedExpanded) {
      setDragY(Math.max(0, Math.min(delta, maxOffset)))
    } else {
      setDragY(Math.max(-maxOffset, Math.min(delta, 90)))
    }
  }

  function pointerEnd(event) {
    const drag = dragRef.current
    if (!drag) return
    const delta = event.clientY - drag.startY
    if (drag.startedExpanded) {
      if (delta > 72) setExpanded(false)
    } else if (delta < -54) {
      setExpanded(true)
    }
    dragRef.current = null
    setDragY(0)
  }

  const sections = Array.isArray(todo.summary.sections) ? todo.summary.sections : []

  return (
    <div className="reminder-summary-layer" role="presentation">
      <button className="reminder-summary-backdrop" type="button" aria-label="요약 닫기" onClick={onClose} />
      <section
        className={`reminder-summary-sheet ${expanded ? 'is-expanded' : ''}`}
        style={{
          '--summary-base-y': expanded ? '0px' : '40dvh',
          '--summary-drag-y': `${dragY}px`,
        }}
        aria-label={`${todo.title} 요약`}
      >
        <div
          className="reminder-summary-drag-zone"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
        >
          <span className="reminder-summary-grabber" aria-hidden="true" />
        </div>

        <header className="reminder-summary-header">
          <div>
            <p>{todo.attachment?.name ? `첨부 · ${todo.attachment.name}` : '리마인더 요약'}</p>
            <h2>{todo.title}</h2>
          </div>
          <button type="button" onClick={onClose}>닫기</button>
        </header>

        <div className="reminder-summary-scroll">
          {todo.summary.overview ? <p className="reminder-summary-overview">{todo.summary.overview}</p> : null}
          {sections.map((section, sectionIndex) => (
            <section className="reminder-summary-section" key={`${section.heading}-${sectionIndex}`}>
              <h3>{section.heading}</h3>
              <ul>
                {section.items.map((item, itemIndex) => (
                  <li key={`${sectionIndex}-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
