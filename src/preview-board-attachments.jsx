import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BOARD_ATTACHMENT_ACCEPT,
  BOARD_ATTACHMENT_LIMIT,
  loadPreviewBoardAttachmentOriginal,
  validatePreviewBoardAttachment,
} from './preview-board-client.js'
import './preview-board-finish.css'
import './reminder-summary.css'

const DOWNLOAD_GESTURE_LOCK_MS = 700

function formatFileSize(value) {
  const bytes = Math.max(0, Number(value || 0))
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 5 * 1024 * 1024 ? 0 : 1)}MB`
}

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''))
  return match ? match[1].toUpperCase() : 'FILE'
}

function AttachmentIcon({ image = false }) {
  return image ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m6 17 4.1-4.2 2.8 2.7 2.2-2.1L18 17" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4" />
    </svg>
  )
}

function isAppleTouchDevice() {
  const userAgent = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(userAgent) || (
    /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1
  )
}

function downloadOriginal(original) {
  const anchor = document.createElement('a')
  anchor.href = original.url
  anchor.download = original.name || '원본-파일'
  anchor.rel = 'noopener'
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function BoardOriginalViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const downloadLockTimerRef = useRef(null)
  const savingRef = useRef(false)

  useEffect(() => {
    savingRef.current = false
    setSaving(false)
    setClosing(false)
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      if (downloadLockTimerRef.current) window.clearTimeout(downloadLockTimerRef.current)
    }
  }, [original?.url])

  function requestClose() {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, 280)
  }

  async function saveOriginal() {
    if (!original?.blob || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    let downloadedDirectly = false
    try {
      if (isAppleTouchDevice()) {
        const file = new File([original.blob], original.name || '원본 파일', {
          type: original.blob.type || original.mimeType || 'application/octet-stream',
        })
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: original.name || '원본 파일' })
          return
        }
      }
      downloadOriginal(original)
      downloadedDirectly = true
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Board original save failed:', error)
    } finally {
      if (downloadedDirectly) {
        downloadLockTimerRef.current = window.setTimeout(() => {
          downloadLockTimerRef.current = null
          savingRef.current = false
          setSaving(false)
        }, DOWNLOAD_GESTURE_LOCK_MS)
      } else {
        savingRef.current = false
        setSaving(false)
      }
    }
  }

  if (!original) return null
  const image = String(original.mimeType || original.blob?.type || '').startsWith('image/')

  return (
    <div className={`reminder-original-viewer ${closing ? 'is-closing' : ''}`.trim()} role="dialog" aria-modal="true" aria-label="원본 파일">
      <button className="reminder-original-backdrop" type="button" aria-label="원본 파일 닫기" onClick={requestClose} />
      <div className="reminder-original-panel">
        <header>
          <strong>{original.name || '원본 파일'}</strong>
          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={requestClose}>×</button>
        </header>
        {image ? (
          <div className="reminder-original-image-wrap">
            <img src={original.url} alt={original.name || '원본 사진'} draggable="false" />
          </div>
        ) : (
          <div className="reminder-original-file-info">
            <strong>{original.name || '원본 파일'}</strong>
            <span>{formatFileSize(original.size)}{original.mimeType ? ` · ${original.mimeType}` : ''}</span>
          </div>
        )}
        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>
          {saving ? '준비 중…' : '원본 저장'}
        </button>
      </div>
    </div>
  )
}

export function BoardAttachmentPicker({ files, onChange, onError, disabled = false, maxFiles = BOARD_ATTACHMENT_LIMIT }) {
  const inputRef = useRef(null)
  const selected = Array.isArray(files) ? files : []
  const safeLimit = Math.max(0, Math.min(
    BOARD_ATTACHMENT_LIMIT,
    Number(maxFiles == null ? BOARD_ATTACHMENT_LIMIT : maxFiles),
  ))

  function chooseFiles(event) {
    const incoming = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    if (!incoming.length) return

    const next = [...selected]
    for (const file of incoming) {
      if (next.length >= safeLimit) {
        onError?.(`새 첨부 파일은 ${safeLimit}개까지 더 올릴 수 있어요.`)
        break
      }
      const validation = validatePreviewBoardAttachment(file)
      if (validation) {
        onError?.(validation)
        continue
      }
      const duplicate = next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
      if (!duplicate) next.push(file)
    }
    onChange(next)
  }

  return (
    <section className="preview-board-attachment-picker" aria-label="첨부 파일">
      <div className="preview-board-attachment-picker-head">
        <div>
          <strong>사진·파일</strong>
          <span>사진, PDF, 한글·오피스 파일 등을 게시글당 최대 {BOARD_ATTACHMENT_LIMIT}개까지 올릴 수 있어요.</span>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || safeLimit <= 0 || selected.length >= safeLimit}
        >
          <AttachmentIcon />
          <span>추가</span>
        </button>
        <input
          ref={inputRef}
          className="preview-board-attachment-input"
          type="file"
          multiple
          accept={BOARD_ATTACHMENT_ACCEPT}
          onChange={chooseFiles}
          disabled={disabled || safeLimit <= 0}
          tabIndex={-1}
        />
      </div>

      {selected.length ? (
        <div className="preview-board-selected-files">
          {selected.map((file, index) => (
            <div className="preview-board-selected-file" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              <span className="preview-board-selected-file-icon" aria-hidden="true">
                <AttachmentIcon image={String(file.type || '').startsWith('image/')} />
              </span>
              <span className="preview-board-selected-file-copy">
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.size)}</small>
              </span>
              <button
                type="button"
                aria-label={`${file.name} 첨부 제거`}
                onClick={() => onChange(selected.filter((_, itemIndex) => itemIndex !== index))}
                disabled={disabled}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function BoardAttachmentGallery({ post }) {
  const attachments = useMemo(() => Array.isArray(post?.attachments) ? post.attachments.slice(0, BOARD_ATTACHMENT_LIMIT) : [], [post])
  const [openingId, setOpeningId] = useState('')
  const [viewer, setViewer] = useState(null)
  const [error, setError] = useState('')
  const objectUrlRef = useRef('')
  const preparedRef = useRef(new Map())

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = ''
    preparedRef.current.clear()
  }, [])

  if (!attachments.length) return null

  function prepareOriginal(attachment) {
    const id = String(attachment?.id || '')
    const cached = preparedRef.current.get(id)
    if (cached) return cached
    const request = loadPreviewBoardAttachmentOriginal(post.id, id).catch((requestError) => {
      if (preparedRef.current.get(id) === request) preparedRef.current.delete(id)
      throw requestError
    })
    preparedRef.current.set(id, request)
    return request
  }

  async function openOriginal(attachment) {
    if (!post?.id || !attachment?.id || openingId) return
    setOpeningId(attachment.id)
    setError('')
    try {
      const original = await prepareOriginal(attachment)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(original.blob)
      objectUrlRef.current = url
      setViewer({ ...original, url })
    } catch (requestError) {
      setError(String(requestError?.message || '원본 파일을 불러오지 못했어요.'))
    } finally {
      setOpeningId('')
    }
  }

  function closeViewer() {
    const url = objectUrlRef.current
    setViewer(null)
    if (url) URL.revokeObjectURL(url)
    if (objectUrlRef.current === url) objectUrlRef.current = ''
  }

  return (
    <>
      <section className="preview-board-attachment-gallery" aria-label={`첨부 파일 ${attachments.length}개`}>
        <div className="preview-board-attachment-gallery-head">
          <strong>첨부 파일</strong>
          <span>{attachments.length}개</span>
        </div>
        <div className="preview-board-attachment-grid">
          {attachments.map((attachment) => {
            const image = Boolean(attachment.isImage || String(attachment.mimeType || '').startsWith('image/'))
            const opening = openingId === attachment.id
            return (
              <button
                type="button"
                className={`preview-board-attachment-card ${image ? 'is-image' : 'is-file'} ${opening ? 'is-loading' : 'is-ready'}`}
                onClick={() => openOriginal(attachment)}
                disabled={Boolean(openingId)}
                key={attachment.id}
              >
                <span className="preview-board-attachment-filemark" aria-hidden="true">
                  {image ? <AttachmentIcon image /> : extensionOf(attachment.fileName)}
                </span>
                <span className="preview-board-attachment-copy">
                  <strong>{attachment.fileName}</strong>
                  <small>{formatFileSize(attachment.sizeBytes)} · {opening ? '원본 불러오는 중…' : '원본 보기·저장'}</small>
                </span>
                <span className="preview-board-attachment-open" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
        {error ? <p className="preview-board-attachment-error" role="alert">{error}</p> : null}
      </section>
      <BoardOriginalViewer original={viewer} onClose={closeViewer} />
    </>
  )
}
