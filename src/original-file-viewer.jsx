import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DOWNLOAD_GESTURE_LOCK_MS = 700
const CLOSE_ANIMATION_MS = 280

function defaultFileSizeLabel(value) {
  const bytes = Math.max(0, Number(value || 0))
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 5 * 1024 * 1024 ? 0 : 1)}MB`
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

export function OriginalFileViewer({
  original,
  onClose,
  formatSize = defaultFileSizeLabel,
  portal = false,
  fallbackName = '원본 파일',
  imageFallbackName = '원본 사진',
  fileFallbackName = '원본 파일',
  shareMimeFallback = 'application/octet-stream',
  saveErrorLabel = 'Original file save failed:',
}) {
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const downloadLockTimerRef = useRef(null)
  const savingRef = useRef(false)

  useEffect(() => {
    savingRef.current = false
    setSaving(false)
    setClosing(false)
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (downloadLockTimerRef.current) {
      window.clearTimeout(downloadLockTimerRef.current)
      downloadLockTimerRef.current = null
    }
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      if (downloadLockTimerRef.current) window.clearTimeout(downloadLockTimerRef.current)
    }
  }, [original?.url])

  function requestClose() {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_ANIMATION_MS)
  }

  async function saveOriginal() {
    if (!original?.blob || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    let downloadedDirectly = false
    try {
      if (isAppleTouchDevice()) {
        const file = new File([original.blob], original.name || fallbackName, {
          type: original.blob.type || original.mimeType || shareMimeFallback,
        })
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: original.name || fallbackName })
          return
        }
      }
      downloadOriginal(original)
      downloadedDirectly = true
    } catch (error) {
      if (error?.name !== 'AbortError') console.error(saveErrorLabel, error)
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
  const content = (
    <div className={`reminder-original-viewer ${closing ? 'is-closing' : ''}`.trim()} role="dialog" aria-modal="true" aria-label="원본 파일">
      <button className="reminder-original-backdrop" type="button" aria-label="원본 파일 닫기" onClick={requestClose} />
      <div className="reminder-original-panel">
        <header>
          <strong>{original.name || fallbackName}</strong>
          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={requestClose}>×</button>
        </header>
        {image ? (
          <div className="reminder-original-image-wrap">
            <img src={original.url} alt={original.name || imageFallbackName} draggable="false" />
          </div>
        ) : (
          <div className="reminder-original-file-info">
            <strong>{original.name || fileFallbackName}</strong>
            <span>{formatSize(original.size)}{original.mimeType ? ` · ${original.mimeType}` : ''}</span>
          </div>
        )}
        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>
          {saving ? '준비 중…' : '원본 저장'}
        </button>
      </div>
    </div>
  )

  if (!portal) return content
  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
