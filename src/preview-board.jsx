import { useCallback, useEffect, useMemo, useState } from 'react'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import { readStudentProfile, studentKeyFor } from './school-sync.js'
import { REMINDER_CATEGORY_COLORS } from './reminder-categories.js'
import {
  addPreviewBoardComment,
  createPreviewBoardPost,
  createPreviewBoardSection,
  loadPreviewBoard,
  resolvePreviewBoardQuestion,
} from './preview-board-client.js'
import './preview-board.css'

const FALLBACK_SECTIONS = [
  { id: 'general', label: '일반', color: '#90939a', builtin: true },
  { id: 'question', label: '질문', color: '#7c83ff', builtin: true },
  { id: 'notes', label: '필기', color: '#56a781', builtin: true },
]

function formatBoardTime(value) {
  const timestamp = Number(value || 0)
  if (!timestamp) return ''
  const elapsed = Math.max(0, Date.now() - timestamp)
  if (elapsed < 60_000) return '방금 전'
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}분 전`
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}시간 전`
  if (elapsed < 7 * 24 * 60 * 60_000) return `${Math.floor(elapsed / (24 * 60 * 60_000))}일 전`
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(timestamp))
}

function normalizeUiError(error, fallback) {
  if (error?.name === 'AbortError') return ''
  const message = String(error?.message || '').trim()
  return message || fallback
}

function sectionFor(sectionId, sections) {
  return sections.find((section) => section.id === sectionId) || FALLBACK_SECTIONS[0]
}

function sectionLabel(sectionId, sections) {
  return sectionFor(sectionId, sections).label || '일반'
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SectionDot({ section, className = 'preview-board-section-dot' }) {
  if (!section?.color) return null
  return (
    <span
      className={className}
      style={{ '--preview-board-section-color': section.color }}
      aria-hidden="true"
    />
  )
}

function PostBadges({ post, sections }) {
  const section = sectionFor(post.sectionId, sections)
  return (
    <>
      <span className={`preview-board-badge ${post.kind === 'question' ? 'is-question' : ''}`}>
        <SectionDot section={section} className="preview-board-badge-dot" />
        {section.label}
      </span>
      {post.kind === 'question' && post.resolved ? (
        <span className="preview-board-badge is-resolved">해결됨</span>
      ) : null}
    </>
  )
}

function BoardSections({ sections, activeSectionId, onSelect, onAdd }) {
  return (
    <div className="preview-board-sections-shell">
      <div className="preview-board-sections" role="tablist" aria-label="게시판 섹션">
        {sections.map((section) => (
          <button
            type="button"
            role="tab"
            key={section.id}
            className={section.id === activeSectionId ? 'is-active' : ''}
            aria-selected={section.id === activeSectionId}
            onClick={() => onSelect(section.id)}
          >
            <SectionDot section={section} />
            <span>{section.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="preview-board-section-add"
          aria-label="게시판 섹션 추가"
          onClick={onAdd}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}

function BoardState({ loading, error, sectionName, onRetry, onWrite }) {
  if (loading) {
    return (
      <div className="preview-board-state" role="status" aria-live="polite">
        <span className="preview-board-state-spinner" aria-hidden="true" />
        <strong>게시판을 불러오는 중이에요</strong>
      </div>
    )
  }
  if (error) {
    return (
      <div className="preview-board-state" role="alert">
        <strong>게시판을 불러오지 못했어요</strong>
        <p>{error}</p>
        <button type="button" className="preview-board-empty-action" onClick={onRetry}>다시 불러오기</button>
      </div>
    )
  }
  return (
    <div className="preview-board-state">
      <strong>{sectionName}에 아직 올라온 글이 없어요</strong>
      <p>같은 반 친구들과 나눌 내용을 첫 글로 올려 보세요.</p>
      <button type="button" className="preview-board-empty-action" onClick={onWrite}>첫 글 쓰기</button>
    </div>
  )
}

function BoardSectionComposer({ open, sections, onClose, onCreated }) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const usedColors = useMemo(
    () => new Set(sections.map((section) => String(section.color || '').toLowerCase()).filter(Boolean)),
    [sections],
  )
  const availableColors = useMemo(
    () => REMINDER_CATEGORY_COLORS.filter((item) => !usedColors.has(item.id)),
    [usedColors],
  )
  const canCreate = label.trim().length > 0 && Boolean(color) && !pending

  useEffect(() => {
    if (!open) return
    setLabel('')
    setColor(availableColors[0]?.id || '')
    setError('')
  }, [open, availableColors])

  async function submit(event) {
    event.preventDefault()
    if (!canCreate) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setPending(true)
    setError('')
    try {
      const section = await createPreviewBoardSection(label.trim(), color)
      onCreated(section)
      onClose()
    } catch (requestError) {
      const code = String(requestError?.code || '')
      if (code === 'board/section-duplicate') setError('같은 이름의 섹션이 이미 있어요.')
      else if (code === 'board/section-color-duplicate') setError('이미 사용 중인 색상이에요.')
      else setError(normalizeUiError(requestError, '섹션을 추가하지 못했어요.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <UnifiedBottomSheet
      open={open}
      onClose={onClose}
      title="새 섹션"
      subtitle="게시판을 구분할 이름과 색상을 골라 주세요."
      ariaLabel="게시판 새 섹션"
      closeDisabled={pending}
      className="preview-board-section-sheet"
    >
      <form className="preview-board-section-form" onSubmit={submit}>
        <label className="preview-board-section-name-field">
          <span>섹션 이름</span>
          <input
            type="text"
            value={label}
            maxLength={16}
            placeholder="예: 자료실"
            onChange={(event) => setLabel(event.target.value)}
            disabled={pending}
            autoComplete="off"
            spellCheck="false"
            autoFocus
          />
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
                  disabled={used || pending}
                  onClick={() => setColor(item.id)}
                  key={item.id}
                >
                  <span style={{ '--preview-board-section-color': item.id }} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </fieldset>

        {!availableColors.length ? <p className="preview-board-error">추가할 수 있는 색상이 없어요.</p> : null}
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}

        <div className="preview-board-section-actions">
          <button type="button" onClick={onClose} disabled={pending}>취소</button>
          <button type="submit" className="is-primary" disabled={!canCreate}>
            {pending ? '추가 중…' : '추가'}
          </button>
        </div>
      </form>
    </UnifiedBottomSheet>
  )
}

function BoardComposer({ open, sections, initialSectionId, onClose, onCreated }) {
  const [sectionId, setSectionId] = useState(initialSectionId || 'general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const canPublish = title.trim().length > 0 && body.trim().length > 0 && !pending

  useEffect(() => {
    if (!open) return
    const safeSection = sections.some((section) => section.id === initialSectionId) ? initialSectionId : 'general'
    setSectionId(safeSection)
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
    try {
      const post = await createPreviewBoardPost({ sectionId, title, body })
      onCreated(post)
      setTitle('')
      setBody('')
      onClose()
    } catch (requestError) {
      setError(normalizeUiError(requestError, '게시글을 올리지 못했어요.'))
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

function BoardDetail({ post, sections, meKey, open, onClose, onUpdated }) {
  const [comment, setComment] = useState('')
  const [commentPending, setCommentPending] = useState(false)
  const [resolvePending, setResolvePending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setComment('')
    setError('')
  }, [open, post?.id])

  if (!post) return null
  const comments = Array.isArray(post.comments) ? post.comments : []
  const isMine = Boolean(meKey && post.authorStudentKey === meKey)
  const canResolve = post.kind === 'question' && post.sectionId === 'question' && !post.resolved && isMine

  async function submitComment(event) {
    event.preventDefault()
    const nextComment = comment.trim()
    if (!nextComment || commentPending) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setCommentPending(true)
    setError('')
    try {
      const updated = await addPreviewBoardComment(post.id, nextComment)
      onUpdated(updated)
      setComment('')
    } catch (requestError) {
      setError(normalizeUiError(requestError, '댓글을 등록하지 못했어요.'))
    } finally {
      setCommentPending(false)
    }
  }

  async function resolveQuestion() {
    if (!canResolve || resolvePending) return
    if (!navigator.onLine) {
      setError('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    setResolvePending(true)
    setError('')
    try {
      const updated = await resolvePreviewBoardQuestion(post.id)
      onUpdated(updated)
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
      closeDisabled={commentPending || resolvePending}
    >
      <div className="preview-board-detail">
        <div className="preview-board-detail-badges"><PostBadges post={post} sections={sections} /></div>
        <p className="preview-board-detail-body">{post.body}</p>
        <div className="preview-board-detail-meta">
          <span>{post.authorName || '학생'}</span>
          <span>댓글 {comments.length}</span>
        </div>

        {canResolve ? (
          <button type="button" className="preview-board-resolve" onClick={resolveQuestion} disabled={resolvePending}>
            {resolvePending ? '처리 중…' : '질문 해결로 표시'}
          </button>
        ) : null}

        <section className="preview-board-comments" aria-label="댓글">
          <h3>댓글 {comments.length}</h3>
          {comments.length ? comments.map((item) => (
            <article className="preview-board-comment" key={item.id}>
              <div className="preview-board-comment-head">
                <strong>{item.authorName || '학생'}</strong>
                <span>{formatBoardTime(item.createdAt)}</span>
              </div>
              <p>{item.body}</p>
            </article>
          )) : <p className="preview-board-comments-empty">아직 댓글이 없어요.</p>}
        </section>

        <form className="preview-board-comment-form" onSubmit={submitComment}>
          <textarea
            value={comment}
            maxLength={500}
            rows={1}
            placeholder="댓글을 입력해 주세요"
            aria-label="댓글 내용"
            disabled={commentPending || resolvePending}
            onChange={(event) => setComment(event.target.value)}
          />
          <button
            type="submit"
            className="preview-board-comment-submit"
            disabled={!comment.trim() || commentPending || resolvePending}
          >
            {commentPending ? '등록 중' : '등록'}
          </button>
        </form>
        {error ? <p className="preview-board-error" role="alert">{error}</p> : null}
      </div>
    </UnifiedBottomSheet>
  )
}

export function PreviewBoard() {
  const [posts, setPosts] = useState([])
  const [sections, setSections] = useState(FALLBACK_SECTIONS)
  const [activeSectionId, setActiveSectionId] = useState('general')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [sectionComposerOpen, setSectionComposerOpen] = useState(false)
  const [detailPostId, setDetailPostId] = useState('')
  const meKey = useMemo(() => studentKeyFor(readStudentProfile()), [])
  const detailPost = useMemo(
    () => posts.find((post) => post.id === detailPostId) || null,
    [posts, detailPostId],
  )
  const activeSectionName = sectionLabel(activeSectionId, sections)

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setRefreshing(true)
    try {
      const result = await loadPreviewBoard({ signal, sectionId: activeSectionId })
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
    setLoading(true)
    setPosts([])
    setDetailPostId('')
    refresh({ quiet: true, signal: controller.signal })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const revalidate = () => {
      if (document.hidden || !navigator.onLine) return
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
  }, [refresh])

  function selectSection(sectionId) {
    if (sectionId === activeSectionId) return
    setError('')
    setActiveSectionId(sectionId)
  }

  function upsertPost(updated) {
    if (updated.sectionId !== activeSectionId) return
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
      setPosts([])
      setActiveSectionId(post.sectionId || 'general')
      return
    }
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)])
  }

  function addCreatedSection(section) {
    setSections((current) => [...current.filter((item) => item.id !== section.id), section])
    setPosts([])
    setError('')
    setActiveSectionId(section.id)
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

      <BoardSections
        sections={sections}
        activeSectionId={activeSectionId}
        onSelect={selectSection}
        onAdd={() => setSectionComposerOpen(true)}
      />

      <div className="preview-board-toolbar">
        <span>{hasPosts ? `${activeSectionName} · 게시글 ${posts.length}개` : activeSectionName}</span>
        <button
          type="button"
          className="preview-board-refresh"
          onClick={() => refresh()}
          disabled={refreshing || loading}
          aria-label="게시판 새로고침"
        >
          새로고침
        </button>
      </div>

      {hasPosts ? (
        <div className="preview-board-list">
          {posts.map((post, index) => {
            const comments = Array.isArray(post.comments) ? post.comments : []
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
                  <span className="preview-board-author">{post.authorName || '학생'}</span>
                  <span className="preview-board-comments-count">댓글 {comments.length}</span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <BoardState
          loading={loading}
          error={error}
          sectionName={activeSectionName}
          onRetry={() => refresh()}
          onWrite={() => setComposerOpen(true)}
        />
      )}

      {error && hasPosts ? <p className="preview-board-error" role="alert">{error}</p> : null}

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
      <BoardDetail
        post={detailPost}
        sections={sections}
        meKey={meKey}
        open={Boolean(detailPost)}
        onClose={() => setDetailPostId('')}
        onUpdated={upsertPost}
      />
    </section>
  )
}
