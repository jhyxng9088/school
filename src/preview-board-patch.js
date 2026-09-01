function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview board marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview board range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const BOARD_PAGE_COMPONENT = String.raw`function PreviewBoardPage() {
  return <PreviewBoard />
}

`

const CLASS_STATION_PAGE_MARKER = String.raw`function ClassStationPage({ section, onSectionChange, timetablePage, boardPage }) {
  return (
    <section className="class-station-page">
      <ClassTopSegment section={section} onSectionChange={onSectionChange} />
      <div className="class-station-content">
        {section === 'board' ? boardPage : timetablePage}
      </div>
    </section>
  )
}
`

const CLASS_STATION_PAGE_WITH_MOTION = String.raw`function ClassStationPage({ section, onSectionChange, timetablePage, boardPage }) {
  return (
    <section className="class-station-page">
      <ClassTopSegment section={section} onSectionChange={onSectionChange} />
      <div className="class-station-content">
        <div
          key={section}
          className={'class-station-panel ' + (section === 'board' ? 'is-board' : 'is-timetable')}
        >
          {section === 'board' ? boardPage : timetablePage}
        </div>
      </div>
    </section>
  )
}
`

const BOARD_COMPOSER = String.raw`function BoardComposer({ open, sections, initialSectionId, onClose, onCreated }) {
  const [sectionId, setSectionId] = useState(initialSectionId || 'general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const canPublish = title.trim().length > 0 && body.trim().length > 0 && !pending

  useEffect(() => {
    if (!open) return
    const safeSection = sections.some((section) => section.id === initialSectionId) ? initialSectionId : 'general'
    setSectionId(safeSection)
    setFiles([])
    setUploadProgress('')
    setError('')
  }, [open, initialSectionId, sections])

  async function submit(event) {
    event.preventDefault()
    if (!canPublish) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setPending(true)
    setError('')
    setUploadProgress('')
    const uploaded = []
    try {
      if (files.length) {
        const draftId = newPreviewBoardAttachmentDraftId()
        for (let index = 0; index < files.length; index += 1) {
          setUploadProgress(`첨부 ${index + 1}/${files.length} 올리는 중…`)
          uploaded.push(await uploadPreviewBoardAttachment(files[index], draftId))
        }
      }
      setUploadProgress(files.length ? '게시글에 첨부하는 중…' : '')
      const post = await createPreviewBoardPost({ sectionId, title, body, attachments: uploaded })
      onCreated(post)
      setTitle('')
      setBody('')
      setFiles([])
      setUploadProgress('')
      onClose()
    } catch (requestError) {
      if (uploaded.length) discardPreviewBoardAttachments(uploaded.map((item) => item.storagePath))
      setError(normalizeUiError(requestError, '게시글을 올리지 못했어요.'))
      setUploadProgress('')
    } finally {
      setPending(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={onClose}
      title="새 게시글"
      subtitle="같은 반 친구들에게만 보여요."
      ariaLabel="새 게시글 작성"
      closeDisabled={pending}
    >
      <form className="preview-board-form" onSubmit={submit}>
        <div className="preview-board-compose-sections" role="group" aria-label="게시할 섹션">
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={sectionId === section.id ? 'is-active' : ''}
              aria-pressed={sectionId === section.id}
              onClick={() => setSectionId(section.id)}
              disabled={pending}
            >
              <SectionDot section={section} />
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        <label className="preview-board-field">
          <span>제목</span>
          <input
            type="text"
            value={title}
            maxLength={70}
            placeholder="제목을 입력해 주세요"
            onChange={(event) => setTitle(event.target.value)}
            disabled={pending}
          />
          <small className="preview-board-field-count">{title.length}/70</small>
        </label>

        <label className="preview-board-field">
          <span>내용</span>
          <textarea
            value={body}
            maxLength={1200}
            rows={6}
            placeholder="내용을 입력해 주세요"
            onChange={(event) => setBody(event.target.value)}
            disabled={pending}
          />
          <small className="preview-board-field-count">{body.length}/1200</small>
        </label>

        <BoardAttachmentPicker
          files={files}
          onChange={setFiles}
          onError={setError}
          disabled={pending}
        />

        {uploadProgress ? <p className="preview-board-upload-progress" role="status">{uploadProgress}</p> : null}
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}

        <div className="preview-board-sheet-actions">
          <button type="button" onClick={onClose} disabled={pending}>취소</button>
          <button type="submit" className="is-primary" disabled={!canPublish}>
            {pending ? '올리는 중…' : '게시하기'}
          </button>
        </div>
      </form>
    </UnifiedBottomSheet>
  )
}

`

function patchBoardComponent(source) {
  let next = String(source || '')
  if (next.includes('Preview-only board completion: cached sections + private attachments.')) return next

  next = replaceRequired(
    next,
    `import {\n  addPreviewBoardComment,\n  createPreviewBoardPost,\n  createPreviewBoardSection,\n  loadPreviewBoard,\n  resolvePreviewBoardQuestion,\n} from './preview-board-client.js'\nimport './preview-board.css'`,
    `import {\n  addPreviewBoardComment,\n  createPreviewBoardPost,\n  createPreviewBoardSection,\n  discardPreviewBoardAttachments,\n  loadPreviewBoard,\n  newPreviewBoardAttachmentDraftId,\n  peekPreviewBoardCache,\n  resolvePreviewBoardQuestion,\n  uploadPreviewBoardAttachment,\n} from './preview-board-client.js'\nimport { BoardAttachmentGallery, BoardAttachmentPicker } from './preview-board-attachments.jsx'\nimport './preview-board.css'\n\n/* Preview-only board completion: cached sections + private attachments. */`,
    'board completion imports',
  )

  next = spliceRequired(
    next,
    `function BoardComposer({ open, sections, initialSectionId, onClose, onCreated }) {`,
    `function BoardDetail({ post, sections, meKey, open, onClose, onUpdated }) {`,
    BOARD_COMPOSER,
    'attachment composer',
  )

  next = replaceRequired(
    next,
    `  const comments = Array.isArray(post.comments) ? post.comments : []\n  const isMine = Boolean(meKey && post.authorStudentKey === meKey)`,
    `  const comments = Array.isArray(post.comments) ? post.comments : []\n  const attachments = Array.isArray(post.attachments) ? post.attachments : []\n  const isMine = Boolean(meKey && post.authorStudentKey === meKey)`,
    'detail attachment list',
  )

  next = replaceRequired(
    next,
    `        <p className="preview-board-detail-body">{post.body}</p>\n        <div className="preview-board-detail-meta">\n          <span>{post.authorName || '학생'}</span>\n          <span>댓글 {comments.length}</span>\n        </div>`,
    `        <p className="preview-board-detail-body">{post.body}</p>\n        <BoardAttachmentGallery post={post} />\n        <div className="preview-board-detail-meta">\n          <span>{post.authorName || '학생'}</span>\n          <span>{attachments.length ? \`첨부 ${'${attachments.length}'} · \` : ''}댓글 {comments.length}</span>\n        </div>`,
    'detail attachment gallery',
  )

  next = replaceRequired(
    next,
    `  const [activeSectionId, setActiveSectionId] = useState('general')\n  const [loading, setLoading] = useState(true)`,
    `  const [activeSectionId, setActiveSectionId] = useState('general')\n  const [sectionDirection, setSectionDirection] = useState(1)\n  const [loading, setLoading] = useState(true)`,
    'section direction state',
  )

  const refreshStart = `  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {`
  const focusEffect = `  useEffect(() => {\n    const revalidate = () => {`
  const refreshReplacement = String.raw`  const refresh = useCallback(async ({ quiet = false, signal, forceSections = false } = {}) => {
    if (!quiet) setRefreshing(true)
    try {
      const result = await loadPreviewBoard({ signal, sectionId: activeSectionId, forceSections })
      setPosts(result.posts)
      if (result.sections.length) setSections(result.sections)
      setError('')
    } catch (requestError) {
      const message = normalizeUiError(requestError, '게시판을 불러오지 못했어요.')
      if (message) setError(message)
    } finally {
      if (!quiet) setRefreshing(false)
      setLoading(false)
    }
  }, [activeSectionId])

  useEffect(() => {
    const controller = new AbortController()
    const cached = peekPreviewBoardCache(activeSectionId)
    setDetailPostId('')
    if (cached) {
      setPosts(cached.posts)
      if (cached.sections.length) setSections(cached.sections)
      setLoading(false)
      if (!cached.isFresh) refresh({ quiet: true, signal: controller.signal })
    } else {
      setLoading(true)
      setPosts([])
      refresh({ quiet: true, signal: controller.signal })
    }
    return () => controller.abort()
  }, [activeSectionId, refresh])

`
  next = spliceRequired(next, refreshStart, focusEffect, refreshReplacement, 'cached section loading')

  next = replaceRequired(
    next,
    `    const revalidate = () => {\n      if (document.hidden || !navigator.onLine) return\n      refresh({ quiet: true })\n    }`,
    `    const revalidate = () => {\n      if (document.hidden || !navigator.onLine) return\n      if (peekPreviewBoardCache(activeSectionId)?.isFresh) return\n      refresh({ quiet: true })\n    }`,
    'quiet stale revalidation',
  )

  next = replaceRequired(
    next,
    `  function selectSection(sectionId) {\n    if (sectionId === activeSectionId) return\n    setError('')\n    setActiveSectionId(sectionId)\n  }`,
    `  function selectSection(sectionId) {\n    if (sectionId === activeSectionId) return\n    const currentIndex = Math.max(0, sections.findIndex((section) => section.id === activeSectionId))\n    const nextIndex = Math.max(0, sections.findIndex((section) => section.id === sectionId))\n    setSectionDirection(nextIndex >= currentIndex ? 1 : -1)\n    setError('')\n    setActiveSectionId(sectionId)\n  }`,
    'section transition direction',
  )

  next = replaceRequired(
    next,
    `            const comments = Array.isArray(post.comments) ? post.comments : []\n            return (`,
    `            const comments = Array.isArray(post.comments) ? post.comments : []\n            const attachments = Array.isArray(post.attachments) ? post.attachments : []\n            return (`,
    'card attachment count',
  )

  next = replaceRequired(
    next,
    `<span className="preview-board-comments-count">댓글 {comments.length}</span>`,
    `<span className="preview-board-comments-count">{attachments.length ? \`첨부 ${'${attachments.length}'} · \` : ''}댓글 {comments.length}</span>`,
    'card attachment meta',
  )

  const contentStart = `      <div className="preview-board-toolbar">`
  const contentEnd = `      {error && hasPosts ? <p className="preview-board-error" role="alert">{error}</p> : null}\n\n`
  const contentStartIndex = next.indexOf(contentStart)
  const contentEndIndex = next.indexOf(contentEnd, contentStartIndex)
  if (contentStartIndex < 0 || contentEndIndex < 0) throw new Error('Preview board range missing: section view wrapper')
  const boardContent = next.slice(contentStartIndex, contentEndIndex + contentEnd.length)
  const wrappedContent = `      <div\n        key={activeSectionId}\n        className="preview-board-section-view"\n        style={{ '--board-section-enter-x': \`${'${sectionDirection * 9}px'}\` }}\n      >\n${boardContent.replace(/^      /gm, '        ')}      </div>\n\n`
  next = `${next.slice(0, contentStartIndex)}${wrappedContent}${next.slice(contentEndIndex + contentEnd.length)}`

  return next
}

export function patchPreviewBoardSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/preview-board.jsx')) return patchBoardComponent(source)
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')
  const boardImport = `import { PreviewBoard } from './preview-board.jsx'`
  const boardThemeImport = `import './preview-board-theme.css'`
  if (!next.includes(boardImport)) {
    next = replaceRequired(
      next,
      `import { SHubAIOrb } from './s-hub-ai-orb.jsx'`,
      `import { SHubAIOrb } from './s-hub-ai-orb.jsx'\n${boardImport}\n${boardThemeImport}`,
      'board import',
    )
  }

  next = spliceRequired(
    next,
    `function PreviewBoardPage() {`,
    `function PreviewStudyPage() {`,
    BOARD_PAGE_COMPONENT,
    'placeholder board page',
  )

  next = replaceRequired(
    next,
    CLASS_STATION_PAGE_MARKER,
    CLASS_STATION_PAGE_WITH_MOTION,
    'class station transition',
  )

  return next
}
