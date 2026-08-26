import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TODO_TYPES } from './todo.jsx'
import { formatParsedDue, parseReminderText } from './reminder-parser.js'
import { parseReminderWithAI } from './firebase-ai.js'
import { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'
import './todo-stage5.css'
import './todo-ai.css'

const FILTERS = [{ id: 'all', label: '전체' }, ...TODO_TYPES]

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDue(todo) {
  const time = todo.dueTime || '23:59'
  return new Date(`${todo.dueDate}T${time}:00`)
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return parseDue(a) - parseDue(b) || a.createdAt - b.createdAt
  })
}

function typeLabel(typeId) {
  return TODO_TYPES.find((type) => type.id === typeId)?.label || '일반'
}

function dueDateLabel(todo) {
  const [year, month, day] = String(todo.dueDate || '').split('-').map(Number)
  if (!year || !month || !day) return String(todo.dueDate || '날짜 없음')
  return `${month}월 ${day}일`
}

function dueMetaLabel(todo, now) {
  const today = dateKey(now)
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const relative = todo.dueDate === today ? '오늘' : todo.dueDate === tomorrow ? '내일' : ''

  if (relative && todo.dueTime) return `${relative} · ${todo.dueTime}`
  if (relative) return relative
  return todo.dueTime || ''
}

function emptyDraft(now) {
  return {
    id: '',
    type: 'task',
    title: '',
    dueDate: dateKey(now),
    dueTime: '',
    summary: null,
    attachment: null,
  }
}

function resultSignature(result) {
  if (!result) return ''
  return [result.type, result.title, result.dueDate, result.dueTime || '', Boolean(result.assumedDate)].join('|')
}

function attachmentErrorMessage(error) {
  const message = String(error?.message || '')
  if (/timed out|timeout|gemini-3\.[67]/i.test(message)) {
    return '이미지 분석 시간이 초과됐어. 최적화된 이미지로 다시 분석해줘.'
  }
  return message || '첨부 분석에 실패했어. 다시 시도해줘.'
}

function AnimatedText({ as = 'span', value, className = '', delay = 0 }) {
  const Tag = as
  const previous = useRef(value)
  const changed = previous.current !== value

  useLayoutEffect(() => {
    previous.current = value
  }, [value])

  return (
    <Tag
      className={`${className} ${changed ? 'is-reminder-text-changing' : ''}`.trim()}
      style={changed ? { '--reminder-text-delay': `${delay}ms` } : undefined}
    >
      {value}
    </Tag>
  )
}

function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary }) {
  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const audit = todo.audit?.name ? `${todo.audit.name}이 ${todo.audit.action === 'modified' ? '수정함' : '추가함'}` : ''
  const content = (
    <>
      <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />
      <AnimatedText as="strong" value={todo.title} delay={45} />
      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {audit ? <span className="todo-audit">{audit}</span> : null}
    </>
  )

  return (
    <article
      className={`todo-item ${completed ? 'is-completed' : ''} ${deleting ? 'is-deleting' : ''}`.trim()}
      data-reminder-id={todo.id}
    >
      <button
        className="todo-check"
        aria-label={`${todo.title} ${completed ? '완료 취소' : '완료'}`}
        onClick={() => onToggle(todo.id)}
      >
        <span />
      </button>
      {todo.summary ? (
        <button
          className="todo-item-main has-summary"
          type="button"
          aria-label={`${todo.title} 요약 보기`}
          onClick={() => onOpenSummary(todo)}
        >
          {content}
        </button>
      ) : (
        <div className="todo-item-main">{content}</div>
      )}
      <div className="todo-row-actions">
        <span className="todo-date-text">{dateLabel}</span>
        {completed ? (
          <button
            className="todo-permanent-delete"
            type="button"
            aria-label={`${todo.title} 영구 삭제`}
            onClick={() => onDelete(todo.id)}
          >
            삭제
          </button>
        ) : (
          <button
            className="todo-edit-button"
            type="button"
            aria-label={`${todo.title} 수정`}
            onClick={() => onEdit(todo)}
          >
            수정
          </button>
        )}
      </div>
    </article>
  )
}

export function TodoPage({ now, todoData }) {
  const {
    todos,
    saveTodo,
    toggleTodo,
    removeTodo,
    createTodoId,
    uploadOriginalAttachment,
    getOriginalAttachment,
  } = todoData
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState('natural')
  const [naturalText, setNaturalText] = useState('')
  const [draft, setDraft] = useState(() => emptyDraft(now))
  const [pageEntering, setPageEntering] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const [filter, setFilter] = useState('all')
  const [aiResult, setAiResult] = useState(null)
  const [aiState, setAiState] = useState('idle')
  const [aiError, setAiError] = useState(null)
  const [attachmentFile, setAttachmentFile] = useState(null)
  const [attachmentRetryKey, setAttachmentRetryKey] = useState(0)
  const [originalSaving, setOriginalSaving] = useState(false)
  const [originalSaveError, setOriginalSaveError] = useState('')
  const [summaryTodo, setSummaryTodo] = useState(null)
  const pageRef = useRef(null)
  const previousRectsRef = useRef(new Map())
  const motionReadyRef = useRef(false)
  const aiRequestRef = useRef(0)

  const sorted = useMemo(() => sortTodos(todos), [todos])
  const active = sorted.filter((todo) => !todo.completed)
  const completed = sorted.filter((todo) => todo.completed)
  const visibleActive = filter === 'all' ? active : active.filter((todo) => todo.type === filter)
  const visibleCompleted = filter === 'all' ? completed : completed.filter((todo) => todo.type === filter)
  const selectedFilterLabel = FILTERS.find((item) => item.id === filter)?.label || '전체'
  const localNaturalResult = useMemo(() => parseReminderText(naturalText, now), [naturalText, now])
  const naturalResult = aiResult || localNaturalResult
  const aiAdjusted = Boolean(!attachmentFile && aiResult && resultSignature(aiResult) !== resultSignature(localNaturalResult))
  const aiTrigger = attachmentFile || naturalText

  useEffect(() => {
    const timer = window.setTimeout(() => setPageEntering(false), 1150)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const text = naturalText.trim()
    const hasAttachment = Boolean(attachmentFile)
    const requestId = aiRequestRef.current + 1
    aiRequestRef.current = requestId
    setAiResult(null)
    setAiError(null)

    if (!sheetOpen || sheetMode !== 'natural' || (!hasAttachment && text.length < 2)) {
      setAiState('idle')
      return undefined
    }

    setAiState('waiting')
    const timer = window.setTimeout(async () => {
      if (aiRequestRef.current !== requestId) return
      setAiState('loading')

      try {
        const parsed = await parseReminderWithAI(text, new Date(), attachmentFile)
        if (aiRequestRef.current !== requestId) return
        if (parsed) setAiResult(parsed)
        setAiError(null)
        setAiState(parsed ? 'ready' : 'error')
      } catch (error) {
        if (aiRequestRef.current !== requestId) return
        console.error('Reminder AI failed:', error)
        setAiError({
          name: error?.name || null,
          code: error?.code || null,
          message: error?.message || null,
          status: error?.status || null,
          customData: error?.customData ? JSON.stringify(error.customData) : null,
        })
        setAiState('error')
      }
    }, hasAttachment ? 420 : 650)

    return () => window.clearTimeout(timer)
  }, [aiTrigger, attachmentRetryKey, sheetOpen, sheetMode])

  useLayoutEffect(() => {
    const root = pageRef.current
    if (!root) return

    const nodes = [...root.querySelectorAll('[data-reminder-id]')]
    const currentRects = new Map()
    nodes.forEach((node) => currentRects.set(node.dataset.reminderId, node.getBoundingClientRect()))

    if (pageEntering) {
      previousRectsRef.current = new Map()
      motionReadyRef.current = false
      return
    }

    if (!motionReadyRef.current) {
      previousRectsRef.current = currentRects
      motionReadyRef.current = true
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reducedMotion) {
      nodes.forEach((node, index) => {
        const id = node.dataset.reminderId
        const previous = previousRectsRef.current.get(id)
        const current = currentRects.get(id)
        if (!current) return

        if (previous) {
          const deltaX = previous.left - current.left
          const deltaY = previous.top - current.top
          if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
            node.animate(
              [
                { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0.9 },
                { transform: 'translate3d(0, 0, 0)', opacity: 1 },
              ],
              {
                duration: 720,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                fill: 'both',
              },
            )
          }
        } else {
          node.animate(
            [
              { transform: 'translate3d(0, 7px, 0)', opacity: 0 },
              { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            ],
            {
              duration: 620,
              delay: Math.min(index * 28, 112),
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both',
            },
          )
        }
      })
    }

    previousRectsRef.current = currentRects
  }, [todos, pageEntering, filter])

  function resetAI() {
    aiRequestRef.current += 1
    setAiResult(null)
    setAiState('idle')
    setAiError(null)
  }

  function openCreate() {
    setNaturalText('')
    setAttachmentFile(null)
    setAttachmentRetryKey(0)
    setOriginalSaving(false)
    setOriginalSaveError('')
    setSummaryTodo(null)
    setDraft(emptyDraft(now))
    setSheetMode('natural')
    resetAI()
    setSheetOpen(true)
  }

  function openEdit(todo) {
    setNaturalText('')
    setAttachmentFile(null)
    setSummaryTodo(null)
    setDraft({
      id: todo.id,
      type: todo.type,
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime || '',
      summary: todo.summary || null,
      attachment: todo.attachment || null,
    })
    setSheetMode('manual')
    resetAI()
    setSheetOpen(true)
  }

  function changeAttachment(file) {
    setAttachmentFile(file)
    setAttachmentRetryKey(0)
    setOriginalSaveError('')
    resetAI()
  }

  function retryAttachment() {
    if (!attachmentFile) return
    resetAI()
    setAttachmentRetryKey((current) => current + 1)
  }

  function syncPickerDisplays() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const sheet = pageRef.current?.querySelector('.todo-sheet')
        sheet?.querySelectorAll('input[type="date"], input[type="time"]').forEach((input) => {
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
      })
    })
  }

  function switchToManual() {
    setDraft(naturalResult ? {
      id: '',
      type: naturalResult.type,
      title: naturalResult.title,
      dueDate: naturalResult.dueDate,
      dueTime: naturalResult.dueTime || '',
      summary: naturalResult.summary || null,
      attachment: naturalResult.attachment || null,
    } : emptyDraft(now))
    resetAI()
    setSheetMode('manual')
    syncPickerDisplays()
  }

  async function submitNatural() {
    if (!naturalResult?.title || !naturalResult?.dueDate || originalSaving) return
    const createId = attachmentFile ? createTodoId() : ''

    if (attachmentFile) {
      setOriginalSaving(true)
      setOriginalSaveError('')
      try {
        await uploadOriginalAttachment(createId, attachmentFile)
      } catch (error) {
        console.error('Original reminder attachment save failed:', error)
        setOriginalSaveError(error?.message || '원본 사진 저장에 실패했어. 다시 시도해줘.')
        return
      } finally {
        setOriginalSaving(false)
      }
    }

    const savedId = saveTodo({
      id: '',
      createId,
      type: naturalResult.type,
      title: naturalResult.title,
      dueDate: naturalResult.dueDate,
      dueTime: naturalResult.dueTime || '',
      summary: naturalResult.summary || null,
      attachment: naturalResult.attachment || null,
    })
    if (savedId) {
      resetAI()
      setSheetOpen(false)
    }
  }

  function submitManual() {
    const savedId = saveTodo(draft)
    if (savedId) setSheetOpen(false)
  }

  function submitCurrent() {
    if (sheetMode === 'natural') submitNatural()
    else submitManual()
  }

  function animatePermanentDelete(id) {
    if (deletingId) return
    setDeletingId(id)
    window.setTimeout(() => {
      removeTodo(id)
      setDeletingId('')
    }, 220)
  }

  function deleteEditing() {
    if (!draft.id) return
    removeTodo(draft.id)
    setSheetOpen(false)
  }

  const aiBusy = aiState === 'waiting' || aiState === 'loading'
  const saveDisabled = originalSaving || (sheetMode === 'natural'
    ? (attachmentFile ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)
    : !draft.title.trim() || !draft.dueDate)

  const summaryText = filter === 'all'
    ? (active.length ? `${active.length}개 남음` : '모두 완료')
    : `${selectedFilterLabel} ${visibleActive.length}개`

  return (
    <section ref={pageRef} className={`todo-page todo-stage5 ${pageEntering ? 'is-page-entering' : ''}`}>
      <header className="todo-header">
        <div>
          <p className="date-label">학교생활 일정</p>
          <h1>리마인더</h1>
        </div>
        <button className="todo-add-button" onClick={openCreate}>추가</button>
      </header>

      <section className="todo-summary">
        <AnimatedText as="strong" value={summaryText} />
        <span>가까운 마감부터 정렬돼.</span>
      </section>

      <section className="todo-list-section reminder-upcoming-section">
        <div className="reminder-list-heading">
          <h2>다가오는 일정</h2>
          <div className="reminder-filter-row" role="group" aria-label="리마인더 종류 필터">
            {FILTERS.map((item) => (
              <button
                type="button"
                className={filter === item.id ? 'is-selected' : ''}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {visibleActive.length ? (
          <div className="todo-list">
            {visibleActive.map((todo) => (
              <ReminderRow
                todo={todo}
                now={now}
                onToggle={toggleTodo}
                onEdit={openEdit}
                onDelete={animatePermanentDelete}
                onOpenSummary={setSummaryTodo}
                key={todo.id}
              />
            ))}
          </div>
        ) : (
          <div className="todo-empty">
            <strong>{filter === 'all' ? '예정된 리마인더가 없어' : `${selectedFilterLabel} 일정이 없어`}</strong>
            <span>{filter === 'all' ? '추가를 누르고 해야 할 일을 한 문장으로 적어봐.' : '다른 종류를 선택하거나 새 리마인더를 추가해.'}</span>
          </div>
        )}
      </section>

      <section
        className={`todo-list-section todo-completed-section ${visibleCompleted.length ? '' : 'is-empty'}`}
        aria-hidden={!visibleCompleted.length}
      >
        <div className="todo-completed-content">
          <h2>완료</h2>
          {visibleCompleted.length ? (
            <div className="todo-list">
              {visibleCompleted.map((todo) => (
                <ReminderRow
                  todo={todo}
                  now={now}
                  completed
                  deleting={deletingId === todo.id}
                  onToggle={toggleTodo}
                  onEdit={openEdit}
                  onDelete={animatePermanentDelete}
                  onOpenSummary={setSummaryTodo}
                  key={todo.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <SummarySheet
        todo={summaryTodo}
        onClose={() => setSummaryTodo(null)}
        loadOriginal={summaryTodo?.id ? () => getOriginalAttachment(summaryTodo.id) : null}
      />

      {sheetOpen ? (
        <section className="todo-sheet">
          <div className="change-editor-head">
            <div>
              <h2>{draft.id ? '리마인더 수정' : '리마인더 추가'}</h2>
              <p>{sheetMode === 'natural' ? '해야 할 일을 그냥 한 문장으로 적어.' : '필요한 정보만 직접 수정해.'}</p>
            </div>
          </div>

          <div className="todo-sheet-form">
            <div className={`reminder-natural-fields ${sheetMode === 'natural' ? 'is-visible' : ''}`} aria-hidden={sheetMode !== 'natural'}>
              <label className="reminder-natural-input-wrap">
                <span>문장으로 추가</span>
                <textarea
                  value={naturalText}
                  onChange={(event) => setNaturalText(event.target.value.slice(0, 140))}
                  placeholder="예: 담주 화욜까지 영어 수헹 PPT"
                  rows={2}
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <AttachmentPicker
                file={attachmentFile}
                busy={aiBusy}
                ready={Boolean(aiResult?.summary)}
                error={attachmentFile && aiState === 'error' ? attachmentErrorMessage(aiError) : ''}
                onChange={changeAttachment}
                onRetry={retryAttachment}
              />

              {originalSaving ? (
                <div className="reminder-original-save-status is-working"><span>원본 사진을 저장하는 중…</span></div>
              ) : originalSaveError ? (
                <div className="reminder-original-save-status is-error"><span>{originalSaveError}</span></div>
              ) : null}

              {naturalResult ? (
                <section className="reminder-parse-preview" aria-live="polite">
                  <p>이렇게 이해했어</p>
                  <strong>{naturalResult.title}</strong>
                  <div className="reminder-parse-chips">
                    <span>{typeLabel(naturalResult.type)}</span>
                    <span>{formatParsedDue(naturalResult, now)}</span>
                  </div>
                  {aiBusy ? (
                    <small className="reminder-ai-status is-working">{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중' : 'AI가 오타와 문맥을 확인하는 중'}</small>
                  ) : aiState === 'ready' ? (
                    <small className="reminder-ai-status is-ready">{attachmentFile ? '첨부 내용 분석과 요약 완료' : aiAdjusted ? 'AI가 오타·축약을 보정했어.' : 'AI 확인 완료'}</small>
                  ) : aiState === 'error' ? (
                    <small className="reminder-ai-status">{attachmentFile ? '텍스트는 유지했어. 첨부만 다시 분석해줘.' : 'AI 연결이 안 돼서 기기 분석 결과를 사용해.'}</small>
                  ) : naturalResult.assumedDate ? (
                    <small>날짜를 안 써서 오늘로 잡았어. 다르면 직접 입력에서 바꿀 수 있어.</small>
                  ) : null}
                </section>
              ) : attachmentFile ? null : (
                <div className="reminder-natural-hint">
                  <span>“내일 체육복 챙기기”</span>
                  <span>“9월 2일 모의고사”</span>
                  <span>“담주 화욜 영어 수헹 PPT”</span>
                </div>
              )}

              <button className="reminder-manual-switch" type="button" onClick={switchToManual}>
                직접 입력
              </button>
            </div>

            <div className={`reminder-manual-fields ${sheetMode === 'manual' ? 'is-visible' : ''}`} aria-hidden={sheetMode !== 'manual'}>
              <div className="todo-type-picker" role="group" aria-label="리마인더 종류">
                {TODO_TYPES.map((type) => (
                  <button
                    type="button"
                    className={draft.type === type.id ? 'is-selected' : ''}
                    onClick={() => setDraft((current) => ({ ...current, type: type.id }))}
                    key={type.id}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <label className="change-field full todo-title-field">
                <span>제목</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 80) }))}
                  placeholder="예: 영어 수행평가 PPT"
                  autoComplete="off"
                />
              </label>

              <div className="todo-due-grid">
                <label className="change-field">
                  <span>마감일</span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                  />
                </label>
                <label className="change-field todo-time-field">
                  <span>시간 · 선택</span>
                  <input
                    type="time"
                    value={draft.dueTime}
                    onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
                  />
                </label>
              </div>

              {draft.id ? (
                <button className="todo-delete-button" type="button" onClick={deleteEditing}>삭제</button>
              ) : null}
            </div>

            <div className="change-submit-row">
              <button type="button" onClick={() => setSheetOpen(false)}>취소</button>
              <button
                type="button"
                className="save-change"
                disabled={saveDisabled}
                onClick={submitCurrent}
              >
                {originalSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
