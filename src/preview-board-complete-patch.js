function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview board complete marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length
  if (start < 0 || end < 0) throw new Error(`Preview board complete range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const BOARD_EDITING_COMPONENTS = String.raw`function BoardPostEditor({ post, sections, open, onClose, onUpdated, onDeleted }) {
  const [sectionId, setSectionId] = useState(post?.sectionId || 'general')
  const [title, setTitle] = useState(post?.title || '')
  const [body, setBody] = useState(post?.body || '')
  const [keptAttachmentIds, setKeptAttachmentIds] = useState([])
  const [files, setFiles] = useState([])
  const [pending, setPending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !post) return
    setSectionId(sections.some((section) => section.id === post.sectionId) ? post.sectionId : 'general')
    setTitle(post.title || '')
    setBody(post.body || '')
    setKeptAttachmentIds((Array.isArray(post.attachments) ? post.attachments : []).map((item) => item.id).filter(Boolean))
    setFiles([])
    setPending(false)
    setDeleting(false)
    setDeleteArmed(false)
    setProgress('')
    setError('')
  }, [open, post?.id, post?.updatedAt, sections])

  if (!post) return null
  const existingAttachments = (Array.isArray(post.attachments) ? post.attachments : [])
    .filter((item) => keptAttachmentIds.includes(item.id))
  const remainingSlots = Math.max(0, BOARD_ATTACHMENT_LIMIT - existingAttachments.length)
  const canSave = title.trim() && body.trim() && !pending && !deleting && existingAttachments.length + files.length <= BOARD_ATTACHMENT_LIMIT

  async function submit(event) {
    event.preventDefault()
    if (!canSave || !navigator.onLine) {
      if (!navigator.onLine) setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setPending(true)
    setError('')
    setProgress('')
    const uploaded = []
    try {
      if (files.length) {
        const draftId = newPreviewBoardAttachmentDraftId()
        for (let index = 0; index < files.length; index += 1) {
          setProgress('첨부 ' + (index + 1) + '/' + files.length + ' 올리는 중…')
          uploaded.push(await uploadPreviewBoardAttachment(files[index], draftId))
        }
      }
      setProgress(files.length ? '게시글을 수정하는 중…' : '')
      const updated = await editPreviewBoardPost({
        postId: post.id,
        sectionId,
        title,
        body,
        keepAttachmentIds: keptAttachmentIds,
        attachments: uploaded,
      })
      onUpdated(updated)
      onClose()
    } catch (requestError) {
      if (uploaded.length) discardPreviewBoardAttachments(uploaded.map((item) => item.storagePath))
      setError(normalizeUiError(requestError, '게시글을 수정하지 못했어요.'))
    } finally {
      setProgress('')
      setPending(false)
    }
  }

  async function removePost() {
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    if (!navigator.onLine || deleting) {
      if (!navigator.onLine) setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setDeleting(true)
    setError('')
    try {
      const result = await deletePreviewBoardPost(post.id)
      onDeleted(result)
      onClose()
    } catch (requestError) {
      setError(normalizeUiError(requestError, '게시글을 삭제하지 못했어요.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={onClose}
      title="게시글 수정"
      subtitle="내용과 섹션, 첨부 파일을 함께 수정할 수 있어요."
      ariaLabel="게시글 수정"
      closeDisabled={pending || deleting}
    >
      <form className="preview-board-form preview-board-edit-form" onSubmit={submit}>
        <div className="preview-board-compose-sections" role="group" aria-label="게시할 섹션">
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={sectionId === section.id ? 'is-active' : ''}
              aria-pressed={sectionId === section.id}
              onClick={() => setSectionId(section.id)}
              disabled={pending || deleting}
            >
              <SectionDot section={section} />
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        <label className="preview-board-field">
          <span>제목</span>
          <input type="text" value={title} maxLength={70} onChange={(event) => setTitle(event.target.value)} disabled={pending || deleting} />
          <small className="preview-board-field-count">{title.length}/70</small>
        </label>

        <label className="preview-board-field">
          <span>내용</span>
          <textarea value={body} maxLength={1200} rows={6} onChange={(event) => setBody(event.target.value)} disabled={pending || deleting} />
          <small className="preview-board-field-count">{body.length}/1200</small>
        </label>

        {existingAttachments.length ? (
          <section className="preview-board-existing-attachments" aria-label="현재 첨부 파일">
            <div className="preview-board-existing-head"><strong>현재 첨부</strong><span>{existingAttachments.length}개</span></div>
            {existingAttachments.map((attachment) => (
              <div className="preview-board-existing-file" key={attachment.id}>
                <span><strong>{attachment.fileName}</strong><small>게시글에 유지됨</small></span>
                <button
                  type="button"
                  onClick={() => setKeptAttachmentIds((current) => current.filter((id) => id !== attachment.id))}
                  disabled={pending || deleting}
                >제거</button>
              </div>
            ))}
          </section>
        ) : null}

        <BoardAttachmentPicker
          files={files}
          onChange={setFiles}
          onError={setError}
          disabled={pending || deleting}
          maxFiles={remainingSlots}
        />

        {progress ? <p className="preview-board-upload-progress" role="status">{progress}</p> : null}
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}

        <div className="preview-board-danger-zone">
          {deleteArmed ? <p>이 글과 댓글을 모두 삭제할까요? 삭제 후 되돌릴 수 없어요.</p> : null}
          <div>
            {deleteArmed ? <button type="button" onClick={() => setDeleteArmed(false)} disabled={deleting}>취소</button> : null}
            <button type="button" className="is-danger" onClick={removePost} disabled={pending || deleting}>
              {deleting ? '삭제 중…' : deleteArmed ? '정말 삭제' : '게시글 삭제'}
            </button>
          </div>
        </div>

        <div className="preview-board-sheet-actions">
          <button type="button" onClick={onClose} disabled={pending || deleting}>닫기</button>
          <button type="submit" className="is-primary" disabled={!canSave}>{pending ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </UnifiedBottomSheet>
  )
}

function BoardSectionEditor({ section, sections, open, onClose, onUpdated, onDeleted }) {
  const [label, setLabel] = useState(section?.label || '')
  const [color, setColor] = useState(section?.color || '')
  const [pending, setPending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [error, setError] = useState('')

  const usedColors = useMemo(() => new Set(
    sections.filter((item) => item.id !== section?.id).map((item) => String(item.color || '').toLowerCase()).filter(Boolean),
  ), [sections, section?.id])

  useEffect(() => {
    if (!open || !section) return
    setLabel(section.label || '')
    setColor(section.color || '')
    setPending(false)
    setDeleting(false)
    setDeleteArmed(false)
    setError('')
  }, [open, section?.id, section?.updatedAt])

  if (!section || section.builtin || !section.ownedByMe) return null
  const canSave = label.trim() && color && !pending && !deleting

  async function submit(event) {
    event.preventDefault()
    if (!canSave) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setPending(true)
    setError('')
    try {
      const updated = await editPreviewBoardSection(section.id, label.trim(), color)
      onUpdated(updated)
      onClose()
    } catch (requestError) {
      setError(normalizeUiError(requestError, '섹션을 수정하지 못했어요.'))
    } finally {
      setPending(false)
    }
  }

  async function removeSection() {
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    if (!navigator.onLine || deleting) {
      if (!navigator.onLine) setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setDeleting(true)
    setError('')
    try {
      const result = await deletePreviewBoardSection(section.id)
      onDeleted(result)
      onClose()
    } catch (requestError) {
      setError(normalizeUiError(requestError, '섹션을 삭제하지 못했어요.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={onClose}
      title="섹션 편집"
      subtitle="직접 만든 섹션의 이름과 색상을 바꿀 수 있어요."
      ariaLabel="게시판 섹션 편집"
      closeDisabled={pending || deleting}
      className="preview-board-section-sheet"
    >
      <form className="preview-board-section-form" onSubmit={submit}>
        <label className="preview-board-section-name-field">
          <span>섹션 이름</span>
          <input type="text" value={label} maxLength={16} onChange={(event) => setLabel(event.target.value)} disabled={pending || deleting} />
        </label>
        <fieldset className="preview-board-section-colors">
          <legend>색상</legend>
          <div>
            {REMINDER_CATEGORY_COLORS.map((item) => {
              const used = usedColors.has(item.id)
              return (
                <button
                  type="button"
                  className={color === item.id ? 'is-selected' : ''}
                  aria-label={`${item.label}${used ? ', 사용 중' : ''}`}
                  aria-pressed={color === item.id}
                  disabled={used || pending || deleting}
                  onClick={() => setColor(item.id)}
                  key={item.id}
                >
                  <span style={{ '--preview-board-section-color': item.id }} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </fieldset>
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}
        <div className="preview-board-danger-zone">
          {deleteArmed ? <p>섹션만 삭제되고 안의 게시글은 일반 섹션으로 이동해요.</p> : null}
          <div>
            {deleteArmed ? <button type="button" onClick={() => setDeleteArmed(false)} disabled={deleting}>취소</button> : null}
            <button type="button" className="is-danger" onClick={removeSection} disabled={pending || deleting}>
              {deleting ? '삭제 중…' : deleteArmed ? '섹션 삭제 확인' : '섹션 삭제'}
            </button>
          </div>
        </div>
        <div className="preview-board-section-actions">
          <button type="button" onClick={onClose} disabled={pending || deleting}>닫기</button>
          <button type="submit" className="is-primary" disabled={!canSave}>{pending ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </UnifiedBottomSheet>
  )
}

function BoardDetail({ post, sections, meKey, open, onClose, onUpdated, onEditPost, onMutated }) {
  const [comment, setComment] = useState('')
  const [commentPending, setCommentPending] = useState(false)
  const [resolvePending, setResolvePending] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState('')
  const [editingCommentBody, setEditingCommentBody] = useState('')
  const [commentActionId, setCommentActionId] = useState('')
  const [deleteCommentId, setDeleteCommentId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setComment('')
    setEditingCommentId('')
    setEditingCommentBody('')
    setCommentActionId('')
    setDeleteCommentId('')
    setError('')
  }, [open, post?.id])

  if (!post) return null
  const comments = Array.isArray(post.comments) ? post.comments : []
  const attachments = Array.isArray(post.attachments) ? post.attachments : []
  const isMine = Boolean(meKey && post.authorStudentKey === meKey)
  const canResolve = post.kind === 'question' && post.sectionId === 'question' && !post.resolved && isMine
  const actionPending = commentPending || resolvePending || Boolean(commentActionId)

  async function submitComment(event) {
    event.preventDefault()
    const nextComment = comment.trim()
    if (!nextComment || actionPending) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setCommentPending(true)
    setError('')
    try {
      const updated = await addPreviewBoardComment(post.id, nextComment)
      onUpdated(updated)
      onMutated(post.id, 'edited')
      setComment('')
    } catch (requestError) {
      setError(normalizeUiError(requestError, '댓글을 등록하지 못했어요.'))
    } finally {
      setCommentPending(false)
    }
  }

  async function saveComment(commentId) {
    const nextBody = editingCommentBody.trim()
    if (!nextBody || actionPending) return
    setCommentActionId(commentId)
    setError('')
    try {
      const updated = await editPreviewBoardComment(post.id, commentId, nextBody)
      onUpdated(updated)
      onMutated(post.id, 'edited')
      setEditingCommentId('')
      setEditingCommentBody('')
    } catch (requestError) {
      setError(normalizeUiError(requestError, '댓글을 수정하지 못했어요.'))
    } finally {
      setCommentActionId('')
    }
  }

  async function removeComment(commentId) {
    if (deleteCommentId !== commentId) {
      setDeleteCommentId(commentId)
      return
    }
    if (actionPending) return
    setCommentActionId(commentId)
    setError('')
    try {
      const updated = await deletePreviewBoardComment(post.id, commentId)
      onUpdated(updated)
      onMutated(post.id, 'edited')
      setDeleteCommentId('')
      if (editingCommentId === commentId) setEditingCommentId('')
    } catch (requestError) {
      setError(normalizeUiError(requestError, '댓글을 삭제하지 못했어요.'))
    } finally {
      setCommentActionId('')
    }
  }

  async function resolveQuestion() {
    if (!canResolve || actionPending) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setResolvePending(true)
    setError('')
    try {
      const updated = await resolvePreviewBoardQuestion(post.id)
      onUpdated(updated)
      onMutated(post.id, 'edited')
    } catch (requestError) {
      setError(normalizeUiError(requestError, '질문 상태를 바꾸지 못했어요.'))
    } finally {
      setResolvePending(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={onClose}
      title={post.title}
      subtitle={`${post.authorName || '학생'} · ${formatBoardTime(post.createdAt)}`}
      ariaLabel="게시글 상세"
      closeDisabled={actionPending}
    >
      <div className="preview-board-detail">
        <div className="preview-board-detail-topline">
          <div className="preview-board-detail-badges"><PostBadges post={post} sections={sections} /></div>
          {isMine ? <button type="button" className="preview-board-owner-edit" onClick={onEditPost} disabled={actionPending}>글 수정</button> : null}
        </div>
        <p className="preview-board-detail-body">{post.body}</p>
        <BoardAttachmentGallery post={post} />
        <div className="preview-board-detail-meta">
          <span>{post.authorName || '학생'}{post.updatedAt > post.createdAt + 1000 ? ' · 수정됨' : ''}</span>
          <span>{attachments.length ? '첨부 ' + attachments.length + ' · ' : ''}댓글 {comments.length}</span>
        </div>

        {canResolve ? (
          <button type="button" className="preview-board-resolve" onClick={resolveQuestion} disabled={resolvePending}>
            {resolvePending ? '처리 중…' : '질문 해결로 표시'}
          </button>
        ) : null}

        <section className="preview-board-comments" aria-label="댓글">
          <h3>댓글 {comments.length}</h3>
          {comments.length ? comments.map((item) => {
            const mine = Boolean(meKey && item.authorStudentKey === meKey)
            const editing = editingCommentId === item.id
            const pending = commentActionId === item.id
            return (
              <article className="preview-board-comment" key={item.id}>
                <div className="preview-board-comment-head">
                  <strong>{item.authorName || '학생'}</strong>
                  <span>{formatBoardTime(item.createdAt)}{item.updatedAt > item.createdAt + 1000 ? ' · 수정됨' : ''}</span>
                </div>
                {editing ? (
                  <div className="preview-board-comment-editor">
                    <textarea value={editingCommentBody} maxLength={500} rows={2} onChange={(event) => setEditingCommentBody(event.target.value)} disabled={pending} />
                    <div>
                      <button type="button" onClick={() => { setEditingCommentId(''); setEditingCommentBody('') }} disabled={pending}>취소</button>
                      <button type="button" className="is-primary" onClick={() => saveComment(item.id)} disabled={!editingCommentBody.trim() || pending}>{pending ? '저장 중…' : '저장'}</button>
                    </div>
                  </div>
                ) : <p>{item.body}</p>}
                {mine && !editing ? (
                  <div className="preview-board-comment-actions">
                    <button type="button" onClick={() => { setEditingCommentId(item.id); setEditingCommentBody(item.body); setDeleteCommentId('') }} disabled={actionPending}>수정</button>
                    <button type="button" className={deleteCommentId === item.id ? 'is-danger' : ''} onClick={() => removeComment(item.id)} disabled={actionPending}>
                      {pending ? '처리 중…' : deleteCommentId === item.id ? '삭제 확인' : '삭제'}
                    </button>
                    {deleteCommentId === item.id ? <button type="button" onClick={() => setDeleteCommentId('')} disabled={actionPending}>취소</button> : null}
                  </div>
                ) : null}
              </article>
            )
          }) : <p className="preview-board-comments-empty">아직 댓글이 없어요.</p>}
        </section>

        <form className="preview-board-comment-form" onSubmit={submitComment}>
          <textarea
            value={comment}
            maxLength={500}
            rows={1}
            placeholder="댓글을 입력해 주세요"
            aria-label="댓글 내용"
            disabled={actionPending}
            onChange={(event) => setComment(event.target.value)}
          />
          <button type="submit" className="preview-board-comment-submit" disabled={!comment.trim() || actionPending}>
            {commentPending ? '등록 중' : '등록'}
          </button>
        </form>
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}
      </div>
    </UnifiedBottomSheet>
  )
}

`

const COMPLETE_BOARD = String.raw`export function PreviewBoard({ profile = null, activitySignal = null }) {
  const [posts, setPosts] = useState([])
  const [sections, setSections] = useState(FALLBACK_SECTIONS)
  const [activeSectionId, setActiveSectionId] = useState('general')
  const [sectionDirection, setSectionDirection] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState('')
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [sectionComposerOpen, setSectionComposerOpen] = useState(false)
  const [sectionEditorId, setSectionEditorId] = useState('')
  const [detailPostId, setDetailPostId] = useState('')
  const [postEditorId, setPostEditorId] = useState('')
  const activityReadyRef = useRef(false)
  const lastActivityAtRef = useRef(0)
  const meKey = useMemo(() => studentKeyFor(profile || readStudentProfile()), [profile])
  const detailPost = useMemo(() => posts.find((post) => post.id === detailPostId) || null, [posts, detailPostId])
  const postEditor = useMemo(() => posts.find((post) => post.id === postEditorId) || detailPost, [posts, postEditorId, detailPost])
  const sectionEditor = useMemo(() => sections.find((section) => section.id === sectionEditorId) || null, [sections, sectionEditorId])
  const activeSection = sectionFor(activeSectionId, sections)
  const activeSectionName = activeSection.label || '일반'

  const refresh = useCallback(async ({ quiet = false, signal, forceSections = null } = {}) => {
    if (!quiet) setRefreshing(true)
    const shouldForceSections = forceSections == null ? !quiet : Boolean(forceSections)
    try {
      const result = await loadPreviewBoard({ signal, sectionId: activeSectionId, forceSections: shouldForceSections })
      setPosts(result.posts)
      setHasMore(result.hasMore)
      setNextCursor(result.nextCursor)
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
    setPostEditorId('')
    if (cached) {
      setPosts(cached.posts)
      setHasMore(cached.hasMore)
      setNextCursor(cached.nextCursor)
      if (cached.sections.length) setSections(cached.sections)
      setLoading(false)
      if (!cached.isFresh) refresh({ quiet: true, signal: controller.signal })
    } else {
      setLoading(true)
      setPosts([])
      setHasMore(false)
      setNextCursor('')
      refresh({ quiet: true, signal: controller.signal })
    }
    return () => controller.abort()
  }, [activeSectionId, refresh])

  useEffect(() => {
    const revalidate = () => {
      if (document.hidden || !navigator.onLine) return
      if (peekPreviewBoardCache(activeSectionId)?.isFresh) return
      refresh({ quiet: true })
    }
    window.addEventListener('focus', revalidate)
    window.addEventListener('online', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('online', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [activeSectionId, refresh])

  useEffect(() => {
    const updatedAt = Number(activitySignal?.updatedAt || 0)
    if (!activityReadyRef.current) {
      activityReadyRef.current = true
      lastActivityAtRef.current = updatedAt
      return undefined
    }
    if (!updatedAt || updatedAt <= lastActivityAtRef.current) return undefined
    lastActivityAtRef.current = updatedAt
    if (activitySignal?.actorStudentKey && activitySignal.actorStudentKey === meKey) return undefined
    if (!navigator.onLine) return undefined
    const timer = window.setTimeout(() => {
      invalidatePreviewBoardSection(activeSectionId)
      refresh({ quiet: true, forceSections: String(activitySignal?.entityId || '').startsWith('section:') })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [activitySignal?.updatedAt, activitySignal?.actorStudentKey, activitySignal?.entityId, activeSectionId, meKey, refresh])

  function announceMutation(entityId, action = 'edited') {
    if (!profile || !entityId) return
    recordClassActivity(profile, 'board', entityId, action)
      .catch((activityError) => console.error('Board realtime signal failed:', activityError))
  }

  function selectSection(sectionId) {
    if (sectionId === activeSectionId) return
    const currentIndex = Math.max(0, sections.findIndex((section) => section.id === activeSectionId))
    const nextIndex = Math.max(0, sections.findIndex((section) => section.id === sectionId))
    const cached = peekPreviewBoardCache(sectionId)
    setSectionDirection(nextIndex >= currentIndex ? 1 : -1)
    setError('')
    setDetailPostId('')
    setPostEditorId('')
    if (cached) {
      setPosts(cached.posts)
      setHasMore(cached.hasMore)
      setNextCursor(cached.nextCursor)
      if (cached.sections.length) setSections(cached.sections)
      setLoading(false)
    } else {
      setPosts([])
      setHasMore(false)
      setNextCursor('')
      setLoading(true)
    }
    setActiveSectionId(sectionId)
  }

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore || !navigator.onLine) return
    setLoadingMore(true)
    setError('')
    try {
      const result = await loadPreviewBoard({ sectionId: activeSectionId, cursor: nextCursor, append: true })
      setPosts(result.posts)
      setHasMore(result.hasMore)
      setNextCursor(result.nextCursor)
    } catch (requestError) {
      setError(normalizeUiError(requestError, '이전 게시글을 불러오지 못했어요.'))
    } finally {
      setLoadingMore(false)
    }
  }

  function upsertPost(updated) {
    if (!updated?.id) return
    if (updated.sectionId !== activeSectionId) {
      setPosts((current) => current.filter((post) => post.id !== updated.id))
      return
    }
    setPosts((current) => {
      const index = current.findIndex((post) => post.id === updated.id)
      if (index < 0) return [updated, ...current]
      const next = [...current]
      next[index] = updated
      return next
    })
  }

  function addCreatedPost(post) {
    if (post.sectionId !== activeSectionId) {
      setPosts([post])
      setHasMore(false)
      setNextCursor('')
      setLoading(false)
      setActiveSectionId(post.sectionId || 'general')
    } else {
      setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)])
    }
    announceMutation(post.id, 'added')
  }

  function addCreatedSection(section) {
    setSections((current) => [...current.filter((item) => item.id !== section.id), section])
    setPosts([])
    setHasMore(false)
    setNextCursor('')
    setError('')
    setActiveSectionId(section.id)
    announceMutation('section:' + section.id, 'added')
  }

  function handlePostEdited(updated) {
    const moved = updated.sectionId !== activeSectionId
    upsertPost(updated)
    setPostEditorId('')
    setDetailPostId('')
    announceMutation(updated.id, 'edited')
    if (moved) selectSection(updated.sectionId)
  }

  function handlePostDeleted(result) {
    setPosts((current) => current.filter((post) => post.id !== result.postId))
    setDetailPostId('')
    setPostEditorId('')
    announceMutation(result.postId, 'edited')
  }

  function handleSectionUpdated(section) {
    setSections((current) => current.map((item) => item.id === section.id ? section : item))
    setSectionEditorId('')
    announceMutation('section:' + section.id, 'edited')
  }

  function handleSectionDeleted(result) {
    setSections((current) => current.filter((item) => item.id !== result.sectionId))
    setSectionEditorId('')
    invalidatePreviewBoardSection('general')
    setPosts([])
    setHasMore(false)
    setNextCursor('')
    setLoading(true)
    setActiveSectionId('general')
    announceMutation('section:' + result.sectionId, 'edited')
  }

  const hasPosts = posts.length > 0

  return (
    <section className="preview-board-page">
      <header className="preview-board-header">
        <div className="preview-board-header-copy">
          <p className="eyebrow">우리 반</p>
          <h1>게시판</h1>
          <p className="preview-board-header-note">같은 반 친구들과 공지, 질문, 필기를 나눌 수 있어요.</p>
        </div>
        <button type="button" className="preview-board-write" onClick={() => setComposerOpen(true)}>
          <PlusIcon />
          <span>글쓰기</span>
        </button>
      </header>

      <BoardSections sections={sections} activeSectionId={activeSectionId} onSelect={selectSection} onAdd={() => setSectionComposerOpen(true)} />

      <div
        key={activeSectionId}
        className="preview-board-section-view"
        style={{ '--board-section-enter-x': (sectionDirection * 9) + 'px' }}
      >
        <div className="preview-board-toolbar">
          <span>{hasPosts ? `${activeSectionName} · 게시글 ${posts.length}${hasMore ? '+' : ''}개` : activeSectionName}</span>
          <div className="preview-board-toolbar-actions">
            {!activeSection.builtin && activeSection.ownedByMe ? (
              <button type="button" className="preview-board-section-edit" onClick={() => setSectionEditorId(activeSection.id)}>섹션 편집</button>
            ) : null}
            <button type="button" className="preview-board-refresh" onClick={() => refresh()} disabled={refreshing || loading} aria-label="게시판 새로고침">
              {refreshing ? '불러오는 중' : '새로고침'}
            </button>
          </div>
        </div>

        {hasPosts ? (
          <>
            <div className="preview-board-list">
              {posts.map((post, index) => {
                const comments = Array.isArray(post.comments) ? post.comments : []
                const attachments = Array.isArray(post.attachments) ? post.attachments : []
                return (
                  <button
                    type="button"
                    className="preview-board-card"
                    key={post.id}
                    style={{ '--board-delay': `${Math.min(index, 8) * 28}ms` }}
                    onClick={() => setDetailPostId(post.id)}
                  >
                    <div className="preview-board-card-top">
                      <div className="preview-board-badges"><PostBadges post={post} sections={sections} /></div>
                      <span className="preview-board-time">{formatBoardTime(post.createdAt)}</span>
                    </div>
                    <h2>{post.title}</h2>
                    <p className="preview-board-card-body">{post.body}</p>
                    <div className="preview-board-card-meta">
                      <span className="preview-board-author">{post.authorName || '학생'}{post.updatedAt > post.createdAt + 1000 ? ' · 수정됨' : ''}</span>
                      <span className="preview-board-comments-count">{attachments.length ? '첨부 ' + attachments.length + ' · ' : ''}댓글 {comments.length}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            {hasMore ? (
              <button type="button" className="preview-board-load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '이전 글 불러오는 중…' : '이전 글 더 보기'}
              </button>
            ) : null}
          </>
        ) : (
          <BoardState loading={loading} error={error} sectionName={activeSectionName} onRetry={() => refresh()} onWrite={() => setComposerOpen(true)} />
        )}

        {error && hasPosts ? <p className="preview-board-error" role="alert">{error}</p> : null}
      </div>

      <BoardComposer
        open={composerOpen}
        sections={sections}
        initialSectionId={activeSectionId}
        onClose={() => setComposerOpen(false)}
        onCreated={addCreatedPost}
      />
      <BoardSectionComposer
        open={sectionComposerOpen}
        sections={sections}
        onClose={() => setSectionComposerOpen(false)}
        onCreated={addCreatedSection}
      />
      <BoardSectionEditor
        section={sectionEditor}
        sections={sections}
        open={Boolean(sectionEditor)}
        onClose={() => setSectionEditorId('')}
        onUpdated={handleSectionUpdated}
        onDeleted={handleSectionDeleted}
      />
      <BoardDetail
        post={detailPost}
        sections={sections}
        meKey={meKey}
        open={Boolean(detailPost)}
        onClose={() => setDetailPostId('')}
        onUpdated={upsertPost}
        onEditPost={() => setPostEditorId(detailPost?.id || '')}
        onMutated={announceMutation}
      />
      <BoardPostEditor
        post={postEditor}
        sections={sections}
        open={Boolean(postEditorId && postEditor)}
        onClose={() => setPostEditorId('')}
        onUpdated={handlePostEdited}
        onDeleted={handlePostDeleted}
      />
    </section>
  )
}
`

export function patchPreviewBoardCompleteSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/preview-board.jsx')) return String(source || '')

  let next = String(source || '')
  if (next.includes('Preview-only completed board CRUD + pagination + realtime invalidation.')) return next

  next = replaceRequired(
    next,
    `import { useCallback, useEffect, useMemo, useState } from 'react'`,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`,
    'react ref import',
  )

  next = replaceRequired(
    next,
    `import { readStudentProfile, studentKeyFor } from './school-sync.js'`,
    `import { readStudentProfile, studentKeyFor } from './school-sync.js'\nimport { recordClassActivity } from './class-activity.js'`,
    'activity import',
  )

  const clientImportStart = `import {\n  addPreviewBoardComment,`
  const clientImportEnd = `} from './preview-board-client.js'`
  const start = next.indexOf(clientImportStart)
  const end = next.indexOf(clientImportEnd, start)
  if (start < 0 || end < 0) throw new Error('Preview board complete marker missing: client imports')
  const completeClientImport = `import {\n  BOARD_ATTACHMENT_LIMIT,\n  addPreviewBoardComment,\n  createPreviewBoardPost,\n  createPreviewBoardSection,\n  deletePreviewBoardComment,\n  deletePreviewBoardPost,\n  deletePreviewBoardSection,\n  discardPreviewBoardAttachments,\n  editPreviewBoardComment,\n  editPreviewBoardPost,\n  editPreviewBoardSection,\n  invalidatePreviewBoardSection,\n  loadPreviewBoard,\n  newPreviewBoardAttachmentDraftId,\n  peekPreviewBoardCache,\n  resolvePreviewBoardQuestion,\n  uploadPreviewBoardAttachment,\n} from './preview-board-client.js'`
  next = `${next.slice(0, start)}${completeClientImport}${next.slice(end + clientImportEnd.length)}`

  next = replaceRequired(
    next,
    `import { BoardAttachmentGallery, BoardAttachmentPicker } from './preview-board-attachments.jsx'\nimport './preview-board.css'`,
    `import { BoardAttachmentGallery, BoardAttachmentPicker } from './preview-board-attachments.jsx'\nimport './preview-board.css'\nimport './preview-board-complete.css'\n\n/* Preview-only completed board CRUD + pagination + realtime invalidation. */`,
    'complete stylesheet',
  )

  next = spliceRequired(
    next,
    `function BoardDetail({ post, sections, meKey, open, onClose, onUpdated }) {`,
    `export function PreviewBoard() {`,
    BOARD_EDITING_COMPONENTS,
    'editing components',
  )

  next = spliceRequired(next, `export function PreviewBoard() {`, '', COMPLETE_BOARD, 'complete board page')
  return next
}
