import { useCallback, useEffect, useMemo, useState } from 'react'
import { UnifiedBottomSheet } from './unified-sheet.jsx'
import { readStudentProfile, studentKeyFor } from './school-sync.js'
import {
  addPreviewBoardComment,
  createPreviewBoardPost,
  loadPreviewBoard,
  resolvePreviewBoardQuestion,
} from './preview-board-client.js'
import './preview-board.css'

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

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6.8V3.5h-3.3" />
      <path d="M19.2 8a8 8 0 1 0 .1 7.8" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function PostBadges({ post }) {
  if (post.kind !== 'question') return <span className="preview-board-badge">일반</span>
  return (
    <>
      <span className="preview-board-badge is-question">질문</span>
      {post.resolved ? <span className="preview-board-badge is-resolved">해결됨</span> : null}
    </>
  )
}

function BoardState({ loading, error, onRetry, onWrite }) {
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
      <strong>아직 올라온 글이 없어요</strong>
      <p>공지할 내용이나 친구들에게 물어볼 게 있으면 첫 글을 올려 보세요.</p>
      <button type="button" className="preview-board-empty-action" onClick={onWrite}>첫 글 쓰기</button>
    </div>
  )
}

function BoardComposer({ open, onClose, onCreated }) {
  const [kind, setKind] = useState('general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const canPublish = title.trim().length > 0 && body.trim().length > 0 && !pending

  useEffect(() => {
    if (!open) return
    setError('')
  }, [open])

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
      const post = await createPreviewBoardPost({ kind, title, body })
      onCreated(post)
      setKind('general')
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
        <div className="preview-board-kind-row" role="group" aria-label="게시글 종류">
          <button
            type="button"
            className={kind === 'general' ? 'is-active' : ''}
            aria-pressed={kind === 'general'}
            onClick={() => setKind('general')}
          >
            일반
          </button>
          <button
            type="button"
            className={kind === 'question' ? 'is-active' : ''}
            aria-pressed={kind === 'question'}
            onClick={() => setKind('question')}
          >
            질문
          </button>
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

function BoardDetail({ post, meKey, open, onClose, onUpdated }) {
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
  const canResolve = post.kind === 'question' && !post.resolved && isMine

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
        <div className="preview-board-detail-badges"><PostBadges post={post} /></div>
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [detailPostId, setDetailPostId] = useState('')
  const meKey = useMemo(() => studentKeyFor(readStudentProfile()), [])
  const detailPost = useMemo(
    () => posts.find((post) => post.id === detailPostId) || null,
    [posts, detailPostId],
  )

  const refresh = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setRefreshing(true)
    try {
      const nextPosts = await loadPreviewBoard({ signal })
      setPosts(nextPosts)
      setError('')
    } catch (requestError) {
      const message = normalizeUiError(requestError, '게시판을 불러오지 못했어요.')
      if (message) setError(message)
    } finally {
      if (!quiet) setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
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

  function upsertPost(updated) {
    setPosts((current) => {
      const index = current.findIndex((post) => post.id === updated.id)
      if (index < 0) return [updated, ...current]
      const next = [...current]
      next[index] = updated
      return next
    })
  }

  function addCreatedPost(post) {
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)])
  }

  const hasPosts = posts.length > 0

  return (
    <section className="preview-board-page">
      <header className="preview-board-header">
        <div className="preview-board-header-copy">
          <p className="eyebrow">우리 반</p>
          <h1>게시판</h1>
          <p className="preview-board-header-note">같은 반 친구들과 공지, 질문을 나눌 수 있어요.</p>
        </div>
        <button type="button" className="preview-board-write" onClick={() => setComposerOpen(true)}>
          <PlusIcon />
          <span>글쓰기</span>
        </button>
      </header>

      <div className="preview-board-toolbar">
        <span>{hasPosts ? `게시글 ${posts.length}개` : '우리 반 게시판'}</span>
        <button
          type="button"
          className={`preview-board-refresh ${refreshing ? 'is-spinning' : ''}`}
          onClick={() => refresh()}
          disabled={refreshing || loading}
          aria-label="게시판 새로고침"
        >
          <RefreshIcon />
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
                  <div className="preview-board-badges"><PostBadges post={post} /></div>
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
          onRetry={() => refresh()}
          onWrite={() => setComposerOpen(true)}
        />
      )}

      {error && hasPosts ? <p className="preview-board-error" role="alert">{error}</p> : null}

      <BoardComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={addCreatedPost}
      />
      <BoardDetail
        post={detailPost}
        meKey={meKey}
        open={Boolean(detailPost)}
        onClose={() => setDetailPostId('')}
        onUpdated={upsertPost}
      />
    </section>
  )
}
