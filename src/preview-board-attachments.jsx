import { useMemo, useRef, useState } from 'react'
import {
  BOARD_ATTACHMENT_ACCEPT,
  BOARD_ATTACHMENT_LIMIT,
  getPreviewBoardAttachmentUrl,
  validatePreviewBoardAttachment,
} from './preview-board-client.js'
import './preview-board-finish.css'

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

export function BoardAttachmentPicker({ files, onChange, onError, disabled = false }) {
  const inputRef = useRef(null)
  const selected = Array.isArray(files) ? files : []

  function chooseFiles(event) {
    const incoming = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    if (!incoming.length) return

    const next = [...selected]
    for (const file of incoming) {
      if (next.length >= BOARD_ATTACHMENT_LIMIT) {
        onError?.(`첨부 파일은 ${BOARD_ATTACHMENT_LIMIT}개까지 올릴 수 있어요.`)
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
          <span>사진, PDF, 한글·오피스 파일 등을 최대 {BOARD_ATTACHMENT_LIMIT}개까지 올릴 수 있어요.</span>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || selected.length >= BOARD_ATTACHMENT_LIMIT}
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
          disabled={disabled}
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
  const [error, setError] = useState('')

  if (!attachments.length) return null

  async function openOriginal(attachment) {
    if (!post?.id || !attachment?.id || openingId) return
    const previewWindow = window.open('', '_blank')
    if (previewWindow) {
      try { previewWindow.opener = null } catch { /* ignore */ }
    }
    setOpeningId(attachment.id)
    setError('')
    try {
      const url = await getPreviewBoardAttachmentUrl(post.id, attachment.id)
      if (previewWindow && !previewWindow.closed) previewWindow.location.replace(url)
      else window.location.assign(url)
    } catch (requestError) {
      if (previewWindow && !previewWindow.closed) previewWindow.close()
      setError(String(requestError?.message || '원본 파일을 열지 못했어요.'))
    } finally {
      setOpeningId('')
    }
  }

  return (
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
                <small>{formatFileSize(attachment.sizeBytes)} · {opening ? '원본 여는 중…' : '원본 보기'}</small>
              </span>
              <span className="preview-board-attachment-open" aria-hidden="true">↗</span>
            </button>
          )
        })}
      </div>
      {error ? <p className="preview-board-attachment-error" role="alert">{error}</p> : null}
    </section>
  )
}
