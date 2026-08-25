import React, { useMemo, useState } from 'react'

const TODO_STORAGE_KEY = 'school.todos.v1'

export const TODO_TYPES = [
  { id: 'task', label: '할 일' },
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

export function useTodos() {
  const [todos, setTodos] = useState(loadTodos)

  function commit(next) {
    const normalized = sortTodos(safeTodos(next))
    persistTodos(normalized)
    setTodos(normalized)
  }

  function saveTodo(input) {
    const title = String(input.title || '').trim()
    const dueDate = String(input.dueDate || '')
    if (!title || !dueDate) return false

    if (input.id) {
      commit(todos.map((todo) => todo.id === input.id
        ? {
            ...todo,
            type: input.type,
            title,
            dueDate,
            dueTime: input.dueTime || '',
          }
        : todo))
      return true
    }

    const todo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: input.type,
      title,
      dueDate,
      dueTime: input.dueTime || '',
      completed: false,
      createdAt: Date.now(),
    }
    commit([...todos, todo])
    return true
  }

  function toggleTodo(id) {
    commit(todos.map((todo) => todo.id === id ? { ...todo, completed: !todo.completed } : todo))
  }

  function removeTodo(id) {
    commit(todos.filter((todo) => todo.id !== id))
  }

  return { todos, saveTodo, toggleTodo, removeTodo }
}

function typeLabel(typeId) {
  return TODO_TYPES.find((type) => type.id === typeId)?.label || '할 일'
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

export function TodoHomePreview({ todos, now }) {
  const upcoming = upcomingTodos(todos)
  const visible = upcoming.slice(0, 3)

  return (
    <section className="home-section todo-home-preview">
      <div className="section-heading">
        <h2>할 일</h2>
        <span>{upcoming.length}개</span>
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
        <div className="compact-empty">아직 등록된 할 일이 없어.</div>
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

  const sorted = useMemo(() => sortTodos(todos), [todos])
  const active = sorted.filter((todo) => !todo.completed)
  const completed = sorted.filter((todo) => todo.completed)

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
    const saved = saveTodo(draft)
    if (saved) setSheetOpen(false)
  }

  function deleteEditing() {
    if (!draft.id) return
    removeTodo(draft.id)
    setSheetOpen(false)
  }

  return (
    <section className="todo-page">
      <header className="todo-header">
        <div>
          <p className="date-label">학교생활 일정</p>
          <h1>투두</h1>
        </div>
        <button className="todo-add-button" onClick={openCreate}>추가</button>
      </header>

      <section className="todo-summary">
        <strong>{active.length ? `${active.length}개 남음` : '모두 완료'}</strong>
        <span>가까운 마감부터 정렬돼.</span>
      </section>

      <section className="todo-list-section">
        <h2>다가오는 일정</h2>
        {active.length ? (
          <div className="todo-list">
            {active.map((todo) => (
              <article className="todo-item" key={todo.id}>
                <button
                  className="todo-check"
                  aria-label={`${todo.title} 완료`}
                  onClick={() => toggleTodo(todo.id)}
                >
                  <span />
                </button>
                <button className="todo-item-main" onClick={() => openEdit(todo)}>
                  <span className="todo-kind">{typeLabel(todo.type)}</span>
                  <strong>{todo.title}</strong>
                  <small>{dueLabel(todo, now)}</small>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="todo-empty">
            <strong>예정된 일이 없어</strong>
            <span>추가 버튼으로 첫 일정을 등록해봐.</span>
          </div>
        )}
      </section>

      {completed.length ? (
        <section className="todo-list-section todo-completed-section">
          <h2>완료</h2>
          <div className="todo-list">
            {completed.map((todo) => (
              <article className="todo-item is-completed" key={todo.id}>
                <button
                  className="todo-check"
                  aria-label={`${todo.title} 완료 취소`}
                  onClick={() => toggleTodo(todo.id)}
                >
                  <span />
                </button>
                <button className="todo-item-main" onClick={() => openEdit(todo)}>
                  <span className="todo-kind">{typeLabel(todo.type)}</span>
                  <strong>{todo.title}</strong>
                  <small>{dueLabel(todo, now)}</small>
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sheetOpen ? (
        <section className="todo-sheet" data-school-sheet>
          <div className="change-editor-head">
            <div>
              <h2>{draft.id ? '일정 수정' : '일정 추가'}</h2>
              <p>필요한 정보만 간단하게 입력해.</p>
            </div>
          </div>

          <div className="todo-sheet-form">
            <div className="todo-type-picker" role="group" aria-label="일정 종류">
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
