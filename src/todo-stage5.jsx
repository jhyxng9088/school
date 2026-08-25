import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TODO_TYPES } from './todo.jsx'
import { formatParsedDue, parseReminderText } from './reminder-parser.js'
import './todo-stage5.css'

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

function dueLabel(todo, now) {
  const today = dateKey(now)
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrow = dateKey(tomorrowDate)
  const prefix = todo.dueDate === today ? '오늘' : todo.dueDate === tomorrow ? '내일' : (() => {
    const [year, month, day] = todo.dueDate.split('-').map(Number)
    if (!year || !month || !day) return todo.dueDate
    return `${month}/${day}`
  })()
  return todo.dueTime ? `${prefix} · ${todo.dueTime}` : prefix
}

function emptyDraft(now) {
  return {
    id: '',
    type: 'task',
    title: '',
    dueDate: dateKey(now),
    dueTime: '',
  }
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

export function TodoPage({ now, todoData }) {
  const { todos, saveTodo, toggleTodo, removeTodo } = todoData
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState('natural')
  const [naturalText, setNaturalText] = useState('')
  const [draft, setDraft] = useState(() => emptyDraft(now))
  const [pageEntering, setPageEntering] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const pageRef = useRef(null)
  const previousRectsRef = useRef(new Map())

  const sorted = useMemo(() => sortTodos(todos), [todos])
  const active = sorted.filter((todo) => !todo.completed)
  const completed = sorted.filter((todo) => todo.completed)
  const naturalResult = useMemo(
    () => parseReminderText(naturalText, now),
    [naturalText, now],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setPageEntering(false), 1150)
    return () => window.clearTimeout(timer)
  }, [])

  useLayoutEffect(() => {
    const root = pageRef.current
    if (!root) return

    const nodes = [...root.querySelectorAll('[data-reminder-id]')]
    const currentRects = new Map()
    nodes.forEach((node) => currentRects.set(node.dataset.reminderId, node.getBoundingClientRect()))

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!pageEntering && !reducedMotion) {
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
                { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0.88 },
                { transform: 'translate3d(0, 0, 0)', opacity: 1 },
              ],
              {
                duration: 760,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                fill: 'both',
              },
            )
          }
        } else {
          node.animate(
            [
              { transform: 'translate3d(0, 9px, 0)', opacity: 0 },
              { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            ],
            {
              duration: 700,
              delay: Math.min(index * 35, 140),
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'both',
            },
          )
        }
      })
    }

    previousRectsRef.current = currentRects
  }, [todos, pageEntering])

  function openCreate() {
    setNaturalText('')
    setDraft(emptyDraft(now))
    setSheetMode('natural')
    setSheetOpen(true)
  }

  function openEdit(todo) {
    setNaturalText('')
    setDraft({
      id: todo.id,
      type: todo.type,
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime || '',
    })
    setSheetMode('manual')
    setSheetOpen(true)
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
    if (naturalResult) {
      setDraft({
        id: '',
        type: naturalResult.type,
        title: naturalResult.title,
        dueDate: naturalResult.dueDate,
        dueTime: naturalResult.dueTime || '',
      })
    } else {
      setDraft(emptyDraft(now))
    }
    setSheetMode('manual')
    syncPickerDisplays()
  }

  function submitNatural() {
    if (!naturalResult?.title || !naturalResult?.dueDate) return
    const savedId = saveTodo({
      id: '',
      type: naturalResult.type,
      title: naturalResult.title,
      dueDate: naturalResult.dueDate,
      dueTime: naturalResult.dueTime || '',
    })
    if (!savedId) return
    setSheetOpen(false)
  }

  function submitManual() {
    const savedId = saveTodo(draft)
    if (!savedId) return
    setSheetOpen(false)
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

  const saveDisabled = sheetMode === 'natural'
    ? !naturalResult?.title
    : !draft.title.trim() || !draft.dueDate

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
        <AnimatedText as="strong" value={active.length ? `${active.length}개 남음` : '모두 완료'} />
        <span>가까운 마감부터 정렬돼.</span>
      </section>

      <section className="todo-list-section">
        <h2>다가오는 일정</h2>
        {active.length ? (
          <div className="todo-list">
            {active.map((todo) => (
              <article className="todo-item" data-reminder-id={todo.id} key={todo.id}>
                <button
                  className="todo-check"
                  aria-label={`${todo.title} 완료`}
                  onClick={() => toggleTodo(todo.id)}
                >
                  <span />
                </button>
                <button className="todo-item-main" onClick={() => openEdit(todo)}>
                  <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />
                  <AnimatedText as="strong" value={todo.title} delay={45} />
                  <AnimatedText as="small" value={dueLabel(todo, now)} delay={90} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="todo-empty">
            <strong>예정된 리마인더가 없어</strong>
            <span>추가를 누르고 해야 할 일을 한 문장으로 적어봐.</span>
          </div>
        )}
      </section>

      <section
        className={`todo-list-section todo-completed-section ${completed.length ? '' : 'is-empty'}`}
        aria-hidden={!completed.length}
      >
        <div className="todo-completed-content">
          <h2>완료</h2>
          {completed.length ? (
            <div className="todo-list">
              {completed.map((todo) => (
                <article
                  className={`todo-item is-completed ${deletingId === todo.id ? 'is-deleting' : ''}`}
                  data-reminder-id={todo.id}
                  key={todo.id}
                >
                  <button
                    className="todo-check"
                    aria-label={`${todo.title} 완료 취소`}
                    onClick={() => toggleTodo(todo.id)}
                  >
                    <span />
                  </button>
                  <button className="todo-item-main" onClick={() => openEdit(todo)}>
                    <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />
                    <AnimatedText as="strong" value={todo.title} delay={45} />
                    <AnimatedText as="small" value={dueLabel(todo, now)} delay={90} />
                  </button>
                  <button
                    className="todo-permanent-delete"
                    type="button"
                    aria-label={`${todo.title} 영구 삭제`}
                    onClick={() => animatePermanentDelete(todo.id)}
                  >
                    삭제
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {sheetOpen ? (
        <section className="todo-sheet" data-school-sheet>
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
                  placeholder="예: 금요일까지 영어 수행 PPT 만들기"
                  rows={2}
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              {naturalResult ? (
                <section className="reminder-parse-preview" aria-live="polite">
                  <p>이렇게 이해했어</p>
                  <strong>{naturalResult.title}</strong>
                  <div className="reminder-parse-chips">
                    <span>{typeLabel(naturalResult.type)}</span>
                    <span>{formatParsedDue(naturalResult, now)}</span>
                  </div>
                  {naturalResult.assumedDate ? (
                    <small>날짜를 안 써서 오늘로 잡았어. 다르면 직접 입력에서 바꿀 수 있어.</small>
                  ) : null}
                </section>
              ) : (
                <div className="reminder-natural-hint">
                  <span>“내일 체육복 챙기기”</span>
                  <span>“9월 2일 모의고사”</span>
                  <span>“다음주 월요일 오후 5시 수학 과제”</span>
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
                {sheetMode === 'natural' ? '추가' : '저장'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
