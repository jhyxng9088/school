import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  listenClassTodos,
  listenStudentTodoState,
  migrateLegacyTodos,
  profileSignature,
  writeSharedTodo,
  writeStudentTodoState,
} from './school-sync'

const TODO_STORAGE_KEY = 'school.todos.v1'

export const TODO_TYPES = [
  { id: 'task', label: '일반' },
  { id: 'performance', label: '수행평가' },
  { id: 'exam', label: '시험' },
  { id: 'material', label: '준비물' },
]

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

function safeTodos(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((todo) => todo && typeof todo === 'object' && todo.id && todo.title && todo.dueDate)
    .map((todo) => ({
      id: String(todo.id),
      type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
      title: String(todo.title).slice(0, 80),
      dueDate: String(todo.dueDate),
      dueTime: String(todo.dueTime || ''),
      completed: Boolean(todo.completed),
      createdAt: Number(todo.createdAt || Date.now()),
    }))
}

function loadTodos() {
  try {
    return safeTodos(JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || '[]'))
  } catch {
    return []
  }
}

function persistTodos(todos) {
  try {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos))
  } catch {
    // Keep the current session usable even when storage is unavailable.
  }
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return parseDue(a) - parseDue(b) || a.createdAt - b.createdAt
  })
}

function sharedTodoShape(todo) {
  return {
    id: String(todo.id),
    type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
    title: String(todo.title || '').trim().slice(0, 80),
    dueDate: String(todo.dueDate || ''),
    dueTime: String(todo.dueTime || ''),
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
  }
}

function initialPersonalState(todos) {
  return Object.fromEntries(todos.map((todo) => [todo.id, {
    completed: Boolean(todo.completed),
    hidden: false,
    updatedAt: 0,
  }]))
}

function mergeSharedTodos(sharedTodos, personalState) {
  return sortTodos(sharedTodos
    .filter((todo) => !personalState[todo.id]?.hidden)
    .map((todo) => ({
      ...todo,
      completed: Boolean(personalState[todo.id]?.completed),
    })))
}

export function useTodos(profile) {
  const legacyTodosRef = useRef(null)
  if (legacyTodosRef.current === null) legacyTodosRef.current = loadTodos()

  const [sharedTodos, setSharedTodos] = useState(() => legacyTodosRef.current.map(sharedTodoShape))
  const [personalState, setPersonalState] = useState(() => initialPersonalState(legacyTodosRef.current))
  const signature = profileSignature(profile)
  const todos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])

  useEffect(() => {
    persistTodos(todos)
  }, [todos])

  useEffect(() => {
    if (!signature) return undefined
    let disposed = false
    let stopClassTodos = () => {}
    let stopPersonalState = () => {}

    ;(async () => {
      try {
        await migrateLegacyTodos(profile, legacyTodosRef.current)
        if (disposed) return

        stopClassTodos = listenClassTodos(
          profile,
          (remoteTodos) => {
            if (disposed) return
            setSharedTodos(remoteTodos.map(sharedTodoShape))
          },
          (error) => console.error('Class reminder sync failed:', error),
        )

        stopPersonalState = listenStudentTodoState(
          profile,
          (remoteState) => {
            if (disposed) return
            setPersonalState(remoteState)
          },
          (error) => console.error('Personal reminder state sync failed:', error),
        )
      } catch (error) {
        console.error('Reminder cloud migration failed:', error)
      }
    })()

    return () => {
      disposed = true
      stopClassTodos()
      stopPersonalState()
    }
  }, [signature])

  function saveTodo(input) {
    const title = String(input.title || '').trim()
    const dueDate = String(input.dueDate || '')
    if (!title || !dueDate) return ''
    const type = TODO_TYPES.some((item) => item.id === input.type) ? input.type : 'task'
    const dueTime = String(input.dueTime || '')

    if (input.id) {
      const updatedAt = Date.now()
      let nextTodo = null
      setSharedTodos((current) => current.map((todo) => {
        if (todo.id !== input.id) return todo
        nextTodo = {
          ...todo,
          type,
          title,
          dueDate,
          dueTime,
          updatedAt,
        }
        return nextTodo
      }))
      if (nextTodo) {
        writeSharedTodo(profile, nextTodo)
          .catch((error) => console.error('Shared reminder update failed:', error))
      }
      return input.id
    }

    const now = Date.now()
    const todo = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      dueDate,
      dueTime,
      createdAt: now,
      updatedAt: now,
    }
    setSharedTodos((current) => [...current, todo])
    writeSharedTodo(profile, todo)
      .catch((error) => console.error('Shared reminder create failed:', error))
    return todo.id
  }

  function toggleTodo(id) {
    const target = todos.find((todo) => todo.id === id)
    if (!target) return
    const completed = !target.completed
    setPersonalState((current) => ({
      ...current,
      [id]: {
        ...current[id],
        completed,
        hidden: false,
        updatedAt: Date.now(),
      },
    }))
    writeStudentTodoState(profile, id, { completed, hidden: false })
      .catch((error) => console.error('Personal reminder completion sync failed:', error))
  }

  function removeTodo(id) {
    const completed = Boolean(personalState[id]?.completed)
    setPersonalState((current) => ({
      ...current,
      [id]: {
        ...current[id],
        completed,
        hidden: true,
        updatedAt: Date.now(),
      },
    }))
    writeStudentTodoState(profile, id, { completed, hidden: true })
      .catch((error) => console.error('Personal reminder delete sync failed:', error))
  }

  return { todos, saveTodo, toggleTodo, removeTodo }
}

function typeLabel(typeId) {
  return TODO_TYPES.find((type) => type.id === typeId)?.label || '일반'
}

function dueLabel(todo, now) {
  const today = dateKey(now)
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const prefix = todo.dueDate === today ? '오늘' : todo.dueDate === tomorrow ? '내일' : (() => {
    const [year, month, day] = todo.dueDate.split('-').map(Number)
    if (!year || !month || !day) return todo.dueDate
    return `${month}/${day}`
  })()
  return todo.dueTime ? `${prefix} · ${todo.dueTime}` : prefix
}

function upcomingTodos(todos) {
  return sortTodos(todos).filter((todo) => !todo.completed)
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

export function TodoHomePreview({ todos, now }) {
  const upcoming = upcomingTodos(todos)
  const visible = upcoming.slice(0, 3)

  return (
    <section className="home-section todo-home-preview">
      <div className="section-heading">
        <h2>리마인더</h2>
        <AnimatedText value={`${upcoming.length}개`} />
      </div>
      {visible.length ? (
        <div className="todo-home-list">
          {visible.map((todo) => (
            <div className="todo-home-item" key={todo.id}>
              <span className={`todo-type-dot type-${todo.type}`} aria-hidden="true" />
              <div>
                <strong>{todo.title}</strong>
                <span>{typeLabel(todo.type)} · {dueLabel(todo, now)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="compact-empty">아직 등록된 리마인더가 없어.</div>
      )}
    </section>
  )
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

export function TodoPage({ now, todoData }) {
  const { todos, saveTodo, toggleTodo, removeTodo } = todoData
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState(() => emptyDraft(now))
  const [pageEntering, setPageEntering] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const pageRef = useRef(null)
  const previousRectsRef = useRef(new Map())

  const sorted = useMemo(() => sortTodos(todos), [todos])
  const active = sorted.filter((todo) => !todo.completed)
  const completed = sorted.filter((todo) => todo.completed)

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
    setDraft(emptyDraft(now))
    setSheetOpen(true)
  }

  function openEdit(todo) {
    setDraft({
      id: todo.id,
      type: todo.type,
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime || '',
    })
    setSheetOpen(true)
  }

  function submitTodo() {
    const savedId = saveTodo(draft)
    if (!savedId) return
    setSheetOpen(false)
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

  return (
    <section ref={pageRef} className={`todo-page ${pageEntering ? 'is-page-entering' : ''}`}>
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
            <span>추가 버튼으로 첫 리마인더를 등록해봐.</span>
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
              <p>필요한 정보만 간단하게 입력해.</p>
            </div>
          </div>

          <div className="todo-sheet-form">
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

            <div className="change-submit-row">
              <button type="button" onClick={() => setSheetOpen(false)}>취소</button>
              <button
                type="button"
                className="save-change"
                disabled={!draft.title.trim() || !draft.dueDate}
                onClick={submitTodo}
              >
                저장
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
