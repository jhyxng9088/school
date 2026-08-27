import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  classKeyFor,
  deleteExpiredSharedTodo,
  getReminderOriginal,
  listenClassTodos,
  listenStudentTodoState,
  profileSignature,
  studentKeyFor,
  writeReminderOriginal,
  writeSharedTodo,
  writeStudentTodoState,
} from './school-sync'
import { recordClassActivity } from './class-activity'

const SUMMARY_MAX_SECTIONS = 14
const SUMMARY_MAX_ITEMS = 16
const ATTACHMENT_MAX_BYTES = 2_500_000
const ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'text/rtf',
  'text/html',
  'text/xml',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
])

function safeSummary(value) {
  if (!value || typeof value !== 'object') return null
  const overview = String(value.overview || '').trim().slice(0, 2400)
  const sections = Array.isArray(value.sections)
    ? value.sections.slice(0, SUMMARY_MAX_SECTIONS).map((section) => ({
        heading: String(section?.heading || '').trim().slice(0, 80),
        items: Array.isArray(section?.items)
          ? section.items.slice(0, SUMMARY_MAX_ITEMS).map((item) => String(item || '').trim().slice(0, 700)).filter(Boolean)
          : [],
      })).filter((section) => section.heading && section.items.length)
    : []
  if (!overview && !sections.length) return null
  return { overview, sections }
}

function safeAttachment(value) {
  if (!value || typeof value !== 'object') return null
  const name = String(value.name || '').trim().slice(0, 120)
  const mimeType = String(value.mimeType || '').trim().toLowerCase()
  const size = Number(value.size || 0)
  if (!name || !ATTACHMENT_MIME_TYPES.has(mimeType)) return null
  if (!Number.isInteger(size) || size <= 0 || size > ATTACHMENT_MAX_BYTES) return null
  return { name, mimeType, size }
}


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


function todoExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return Number.POSITIVE_INFINITY

  const dueTime = String(todo?.dueTime || '').trim()
  const expiryTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)
    ? `${dueTime}:00.000`
    : '23:59:59.000'
  const expiry = Date.parse(`${dueDate}T${expiryTime}+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}

function isTodoExpired(todo, nowMs = Date.now()) {
  return todoExpiryMs(todo) <= nowMs
}

function visibleUnexpiredTodos(todos, nowMs = Date.now()) {
  return (todos || []).filter((todo) => !isTodoExpired(todo, nowMs))
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return parseDue(a) - parseDue(b) || a.createdAt - b.createdAt
  })
}

function sharedTodoShape(todo) {
  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  return {
    id: String(todo.id),
    type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
    title: String(todo.title || '').trim().slice(0, 80),
    dueDate: String(todo.dueDate || ''),
    dueTime: String(todo.dueTime || ''),
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
  }
}

function mergeSharedTodos(sharedTodos, personalState) {
  return sortTodos(sharedTodos
    .filter((todo) => !personalState[todo.id]?.hidden)
    .map((todo) => ({
      ...todo,
      completed: Boolean(personalState[todo.id]?.completed),
    })))
}

function createTodoId() {
  const now = Date.now()
  return `${now}-${Math.random().toString(36).slice(2, 8)}`
}

const SHARED_TODOS_CACHE_VERSION = 'v1'
const PERSONAL_TODO_STATE_CACHE_VERSION = 'v1'
const VISIBLE_TODOS_CACHE_VERSION = 'v1'

function visibleTodosCacheKey(profile) {
  const studentKey = studentKeyFor(profile)
  return studentKey ? `school.visibleTodos.${VISIBLE_TODOS_CACHE_VERSION}.${studentKey}` : ''
}

function readVisibleTodosCache(profile) {
  const key = visibleTodosCacheKey(profile)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const stored = JSON.parse(raw)
    if (!Array.isArray(stored)) return null
    return sortTodos(stored.map((todo) => ({ ...sharedTodoShape(todo), completed: Boolean(todo.completed) })))
  } catch {
    return null
  }
}

function writeVisibleTodosCache(profile, todos) {
  const key = visibleTodosCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify((todos || []).map((todo) => ({ ...sharedTodoShape(todo), completed: Boolean(todo.completed) }))))
  } catch {
    // First-paint cache only. Firestore remains authoritative.
  }
}

function sharedTodosCacheKey(profile) {
  const classKey = classKeyFor(profile)
  return classKey ? `school.sharedTodos.${SHARED_TODOS_CACHE_VERSION}.${classKey}` : ''
}

function readSharedTodosCache(profile) {
  const key = sharedTodosCacheKey(profile)
  if (!key) return []
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(stored) ? stored.map(sharedTodoShape) : []
  } catch {
    return []
  }
}

function writeSharedTodosCache(profile, todos) {
  const key = sharedTodosCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify((todos || []).map(sharedTodoShape)))
  } catch {
    // Cache only accelerates first paint. Firestore remains authoritative.
  }
}

function personalTodoStateCacheKey(profile) {
  const studentKey = studentKeyFor(profile)
  return studentKey ? `school.personalTodoState.${PERSONAL_TODO_STATE_CACHE_VERSION}.${studentKey}` : ''
}

function normalizePersonalTodoState(value) {
  if (!value || typeof value !== 'object') return {}
  const next = {}
  Object.entries(value).forEach(([id, entry]) => {
    if (!id || !entry || typeof entry !== 'object') return
    next[id] = {
      completed: Boolean(entry.completed),
      hidden: Boolean(entry.hidden),
      updatedAt: Number(entry.updatedAt || 0),
    }
  })
  return next
}

function readPersonalTodoStateCache(profile) {
  const key = personalTodoStateCacheKey(profile)
  if (!key) return {}
  try {
    return normalizePersonalTodoState(JSON.parse(localStorage.getItem(key) || '{}'))
  } catch {
    return {}
  }
}

function writePersonalTodoStateCache(profile, state) {
  const key = personalTodoStateCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(normalizePersonalTodoState(state)))
  } catch {
    // Firestore remains authoritative; this cache only prevents stale first paint.
  }
}

export function useTodos(profile) {
  const signature = profileSignature(profile)
  const [sharedTodos, setSharedTodos] = useState(() => readSharedTodosCache(profile))
  const sharedTodosRef = useRef(sharedTodos)
  const [personalState, setPersonalState] = useState(() => readPersonalTodoStateCache(profile))
  const [bootTodos, setBootTodos] = useState(() => readVisibleTodosCache(profile) ?? mergeSharedTodos(readSharedTodosCache(profile), readPersonalTodoStateCache(profile)))
  const [remoteReady, setRemoteReady] = useState(false)
  const [expiryClock, setExpiryClock] = useState(() => Date.now())
  const expiryDeleteAttemptsRef = useRef(new Set())
  const firstRemoteReadyRef = useRef(false)
  const remoteSharedRef = useRef(null)
  const remotePersonalRef = useRef(null)
  const mergedTodos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])
  const sourceTodos = remoteReady ? mergedTodos : bootTodos
  const todos = useMemo(() => visibleUnexpiredTodos(sourceTodos, expiryClock), [sourceTodos, expiryClock])

  useEffect(() => {
    writeVisibleTodosCache(profile, todos)
  }, [signature, todos])


  useEffect(() => {
    const syncExpiryClock = () => setExpiryClock(Date.now())
    const upcoming = sourceTodos
      .map(todoExpiryMs)
      .filter((time) => Number.isFinite(time) && time > Date.now())
      .sort((a, b) => a - b)[0]
    const delay = upcoming
      ? Math.max(20, Math.min(upcoming - Date.now() + 20, 2_147_000_000))
      : 2_147_000_000
    const timer = window.setTimeout(syncExpiryClock, delay)
    const onVisibility = () => {
      if (!document.hidden) syncExpiryClock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', syncExpiryClock)
    window.addEventListener('online', syncExpiryClock)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', syncExpiryClock)
      window.removeEventListener('online', syncExpiryClock)
    }
  }, [sourceTodos])

  useEffect(() => {
    if (!signature || navigator.onLine === false) return
    const expired = sourceTodos.filter((todo) => isTodoExpired(todo, expiryClock))
    expired.forEach((todo) => {
      if (expiryDeleteAttemptsRef.current.has(todo.id)) return
      expiryDeleteAttemptsRef.current.add(todo.id)
      deleteExpiredSharedTodo(profile, todo.id)
        .catch((error) => {
          console.error('Expired shared reminder delete failed:', error)
          window.setTimeout(() => expiryDeleteAttemptsRef.current.delete(todo.id), 60_000)
        })
    })
  }, [signature, sourceTodos, expiryClock])

  useEffect(() => {
    try { localStorage.removeItem('school.todos.v1') } catch { /* stale cache cleanup is best-effort */ }
  }, [])

  useEffect(() => {
    if (!signature) {
      sharedTodosRef.current = []
      setSharedTodos([])
      setPersonalState({})
      return undefined
    }

    let disposed = false
    const cachedShared = readSharedTodosCache(profile)
    const cachedPersonal = readPersonalTodoStateCache(profile)
    sharedTodosRef.current = cachedShared
    setSharedTodos(cachedShared)
    setPersonalState(cachedPersonal)
    setBootTodos(readVisibleTodosCache(profile) ?? mergeSharedTodos(cachedShared, cachedPersonal))
    setRemoteReady(false)
    firstRemoteReadyRef.current = false
    remoteSharedRef.current = null
    remotePersonalRef.current = null

    const commitFirstRemotePair = () => {
      if (disposed || firstRemoteReadyRef.current) return
      if (remoteSharedRef.current === null || remotePersonalRef.current === null) return
      firstRemoteReadyRef.current = true
      const nextShared = remoteSharedRef.current
      const nextPersonal = remotePersonalRef.current
      sharedTodosRef.current = nextShared
      setSharedTodos(nextShared)
      setPersonalState(nextPersonal)
      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(nextShared, nextPersonal))
      writeVisibleTodosCache(profile, nextVisible)
      setBootTodos(nextVisible)
      setRemoteReady(true)
    }

    const stopClassTodos = listenClassTodos(
      profile,
      (remoteTodos) => {
        if (disposed) return
        const next = remoteTodos.map(sharedTodoShape)
        writeSharedTodosCache(profile, next)
        remoteSharedRef.current = next
        if (firstRemoteReadyRef.current) {
          sharedTodosRef.current = next
          setSharedTodos(next)
        } else commitFirstRemotePair()
      },
      (error) => console.error('Class reminder sync failed:', error),
    )

    const stopPersonalState = listenStudentTodoState(
      profile,
      (remoteState) => {
        if (disposed) return
        const next = normalizePersonalTodoState(remoteState)
        writePersonalTodoStateCache(profile, next)
        remotePersonalRef.current = next
        if (firstRemoteReadyRef.current) setPersonalState(next)
        else commitFirstRemotePair()
      },
      (error) => console.error('Personal reminder state sync failed:', error),
    )

    return () => {
      disposed = true
      stopClassTodos()
      stopPersonalState()
    }
  }, [signature])

  function updateSharedTodos(updater) {
    setSharedTodos((current) => {
      const next = updater(current)
      sharedTodosRef.current = next
      writeSharedTodosCache(profile, next)
      if (!firstRemoteReadyRef.current) {
        const nextVisible = mergeSharedTodos(next, personalState)
        setBootTodos(nextVisible)
        writeVisibleTodosCache(profile, nextVisible)
      }
      return next
    })
  }

  async function saveTodo(input) {
    const title = String(input.title || '').trim()
    const dueDate = String(input.dueDate || '')
    if (!title || !dueDate) return ''
    const type = TODO_TYPES.some((item) => item.id === input.type) ? input.type : 'task'
    const dueTime = String(input.dueTime || '')
    const summary = safeSummary(input.summary)
    const attachment = safeAttachment(input.attachment)

    if (input.id) {
      const currentTodo = sharedTodos.find((todo) => todo.id === input.id)
      if (!currentTodo) return ''
      const nextTodo = {
        ...currentTodo,
        type,
        title,
        dueDate,
        dueTime,
        updatedAt: Date.now(),
        ...(summary ? { summary } : {}),
        ...(attachment ? { attachment } : {}),
      }

      updateSharedTodos((current) => current.map((todo) => todo.id === input.id ? nextTodo : todo))
      try {
        await writeSharedTodo(profile, nextTodo)
      } catch (error) {
        updateSharedTodos((current) => current.map((todo) => (
          todo.id === input.id && todo.updatedAt === nextTodo.updatedAt ? currentTodo : todo
        )))
        throw error
      }

      recordClassActivity(profile, 'reminder', input.id, 'edited')
        .catch((error) => console.error('Reminder attribution update failed:', error))
      return input.id
    }

    const now = Date.now()
    const todo = {
      id: String(input.createId || '').trim().slice(0, 100) || createTodoId(),
      type,
      title,
      dueDate,
      dueTime,
      createdAt: now,
      updatedAt: now,
      ...(summary ? { summary } : {}),
      ...(attachment ? { attachment } : {}),
    }

    updateSharedTodos((current) => sortTodos([
      ...current.filter((item) => item.id !== todo.id),
      todo,
    ]))
    try {
      await writeSharedTodo(profile, todo)
    } catch (error) {
      updateSharedTodos((current) => current.filter((item) => !(item.id === todo.id && item.updatedAt === todo.updatedAt)))
      throw error
    }

    recordClassActivity(profile, 'reminder', todo.id, 'added')
      .catch((error) => console.error('Reminder attribution create failed:', error))
    return todo.id
  }

  async function enrichTodo(id, enrichment = {}) {
    const currentTodo = sharedTodosRef.current.find((todo) => todo.id === id)
    if (!currentTodo) return false
    const summary = safeSummary(enrichment.summary)
    if (!summary) return false
    const attachment = safeAttachment(enrichment.attachment)
    const nextTodo = {
      ...currentTodo,
      summary,
      updatedAt: Date.now(),
      ...(attachment ? { attachment } : {}),
    }

    updateSharedTodos((current) => current.map((todo) => todo.id === id ? nextTodo : todo))
    try {
      await writeSharedTodo(profile, nextTodo)
      return true
    } catch (error) {
      updateSharedTodos((current) => current.map((todo) => (
        todo.id === id && todo.updatedAt === nextTodo.updatedAt ? currentTodo : todo
      )))
      throw error
    }
  }

  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {
    setPersonalState((current) => {
      const next = { ...current, [id]: nextEntry }
      writePersonalTodoStateCache(profile, next)
      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(sharedTodos, next))
      writeVisibleTodosCache(profile, nextVisible)
      if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)
      return next
    })
    writeStudentTodoState(profile, id, nextEntry).catch((error) => {
      console.error('Personal reminder state save failed:', error)
      setPersonalState((current) => {
        if (current[id]?.updatedAt !== nextEntry.updatedAt) return current
        const next = { ...current }
        if (previousEntry) next[id] = previousEntry
        else delete next[id]
        writePersonalTodoStateCache(profile, next)
        const nextVisible = mergeSharedTodos(sharedTodos, next)
        writeVisibleTodosCache(profile, nextVisible)
        if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)
        return next
      })
    })
  }

  function toggleTodo(id) {
    const target = todos.find((todo) => todo.id === id)
    if (!target) return
    const previousEntry = personalState[id] || null
    const nextEntry = {
      completed: !target.completed,
      hidden: false,
      updatedAt: Date.now(),
    }
    updatePersonalStateOnServer(id, nextEntry, previousEntry)
  }

  function removeTodo(id) {
    const previousEntry = personalState[id] || null
    const nextEntry = {
      completed: Boolean(previousEntry?.completed),
      hidden: true,
      updatedAt: Date.now(),
    }
    updatePersonalStateOnServer(id, nextEntry, previousEntry)
  }

  function originalAttachmentId(todoId, key = '') {
    const safeKey = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)
    return safeKey ? `${todoId}--${safeKey}` : todoId
  }

  function uploadOriginalAttachment(todoId, file, key = '') {
    return writeReminderOriginal(profile, originalAttachmentId(todoId, key), file)
  }

  function getOriginalAttachment(todoId, key = '') {
    return getReminderOriginal(profile, originalAttachmentId(todoId, key))
  }

  return {
    todos,
    saveTodo,
    enrichTodo,
    toggleTodo,
    removeTodo,
    createTodoId,
    uploadOriginalAttachment,
    getOriginalAttachment,
  }
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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
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
    setSaveError('')
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
    setSaveError('')
    setSheetOpen(true)
  }

  async function submitTodo() {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      const savedId = await saveTodo(draft)
      if (!savedId) return
      setSheetOpen(false)
    } catch (error) {
      console.error('Shared reminder save failed:', error)
      setSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')
    } finally {
      setSaving(false)
    }
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

            {saveError ? <p className="change-warning">{saveError}</p> : null}

            <div className="change-submit-row">
              <button type="button" onClick={() => setSheetOpen(false)}>취소</button>
              <button
                type="button"
                className="save-change"
                disabled={saving || !draft.title.trim() || !draft.dueDate}
                onClick={submitTodo}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
