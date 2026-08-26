from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)


# Reminder page: remove cancel-prone FLIP motion and use the shared sheet.
p = 'src/todo-stage5-ai.jsx'
t = read(p)
t = once(t, "import { activityKey, activityLabel, useClassActivity } from './class-activity'\n", "import { activityKey, activityLabel, useClassActivity } from './class-activity'\nimport { UnifiedBottomSheet } from './unified-sheet.jsx'\n", 'todo import')
t = once(t, "function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary, attribution }) {", "function ReminderRow({ todo, now, completed = false, motion = '', onToggle, onEdit, onDelete, onOpenSummary, attribution }) {", 'row signature')
t = once(t, "      className={`todo-item ${completed ? 'is-completed' : ''} ${deleting ? 'is-deleting' : ''}`.trim()}", "      className={`todo-item ${completed ? 'is-completed' : ''} ${motion === 'leaving' ? 'is-state-leaving' : ''} ${motion === 'entering' ? 'is-state-entering' : ''}`.trim()}", 'row class')
t = once(t, "  const [deletingId, setDeletingId] = useState('')\n", "  const [rowMotion, setRowMotion] = useState({})\n", 'row state')
t = once(t, "  const previousRectsRef = useRef(new Map())\n  const motionReadyRef = useRef(false)\n", "  const rowMotionRef = useRef(new Set())\n", 'flip refs')
start = t.find("  useLayoutEffect(() => {\n    const root = pageRef.current\n    if (!root) return\n\n    const nodes = [...root.querySelectorAll('[data-reminder-id]')]")
end_marker = "  }, [todos, pageEntering, filter])\n"
end = t.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Missing reminder FLIP block')
t = t[:start] + t[end + len(end_marker):]
t = once(t, "        const sheet = pageRef.current?.querySelector('.todo-sheet')", "        const sheet = document.querySelector('.unified-school-sheet.todo-sheet')", 'portal picker')
old = """  function animatePermanentDelete(id) {
    if (deletingId) return
    setDeletingId(id)
    window.setTimeout(() => {
      removeTodo(id)
      setDeletingId('')
    }, 220)
  }
"""
new = """  function beginRowExit(id, action) {
    if (!id || rowMotionRef.current.has(id)) return
    rowMotionRef.current.add(id)
    setRowMotion((current) => ({ ...current, [id]: 'leaving' }))

    window.setTimeout(() => {
      if (action === 'toggle') toggleTodo(id)
      else removeTodo(id)

      if (action === 'toggle') {
        setRowMotion((current) => ({ ...current, [id]: 'entering' }))
        window.setTimeout(() => {
          rowMotionRef.current.delete(id)
          setRowMotion((current) => {
            const next = { ...current }
            delete next[id]
            return next
          })
        }, 420)
      } else {
        rowMotionRef.current.delete(id)
        setRowMotion((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
      }
    }, 280)
  }

  function animateToggleTodo(id) {
    beginRowExit(id, 'toggle')
  }

  function animatePermanentDelete(id) {
    beginRowExit(id, 'delete')
  }
"""
t = once(t, old, new, 'row transition functions')
t = t.replace('onToggle={toggleTodo}', 'onToggle={animateToggleTodo}')
t = once(t, "                attribution={activity[activityKey('reminder', todo.id)] || null}\n                key={todo.id}", "                attribution={activity[activityKey('reminder', todo.id)] || null}\n                motion={rowMotion[todo.id] || ''}\n                key={todo.id}", 'active motion prop')
t = once(t, "                  deleting={deletingId === todo.id}\n                  onToggle={animateToggleTodo}", "                  motion={rowMotion[todo.id] || ''}\n                  onToggle={animateToggleTodo}", 'completed motion prop')
old = """      {sheetOpen ? (
        <section className="todo-sheet">
          <div className="change-editor-head">
            <div>
              <h2>{draft.id ? '리마인더 수정' : '리마인더 추가'}</h2>
              <p>{sheetMode === 'natural' ? '해야 할 일을 그냥 한 문장으로 적어.' : '필요한 정보만 직접 수정해.'}</p>
            </div>
          </div>

          <div className="todo-sheet-form">
"""
new = """      <UnifiedBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        closeDisabled={originalSaving || serverSaving}
        title={draft.id ? '리마인더 수정' : '리마인더 추가'}
        subtitle={sheetMode === 'natural' ? '해야 할 일을 그냥 한 문장으로 적어.' : '필요한 정보만 직접 수정해.'}
        ariaLabel={draft.id ? '리마인더 수정' : '리마인더 추가'}
        className="todo-sheet"
      >
        <div className="todo-sheet-form">
"""
t = once(t, old, new, 'todo sheet start')
t = once(t, """          </div>
        </section>
      ) : null}
    </section>
  )
}
""", """        </div>
      </UnifiedBottomSheet>
    </section>
  )
}
""", 'todo sheet end')
write(p, t)


# Timetable modal: same shared component.
p = 'src/main.jsx'
t = read(p)
t = once(t, "import { SharedAcademicPage, SharedAcademicPreview } from './academic-shared'\n", "import { SharedAcademicPage, SharedAcademicPreview } from './academic-shared'\nimport { UnifiedBottomSheet } from './unified-sheet.jsx'\n", 'main import')
t = once(t, """      {changeOpen && !editing ? (
        <section className="change-editor">
          <div className="change-editor-head">
            <div>
              <h2>변경 시간표 추가</h2>
              <p>기본 시간표는 그대로 두고 선택한 날짜에만 적용돼.</p>
            </div>
          </div>
          <div className="change-form">
""", """      <UnifiedBottomSheet
        open={changeOpen && !editing}
        onClose={() => setChangeOpen(false)}
        title="변경 시간표 추가"
        subtitle="기본 시간표는 그대로 두고 선택한 날짜에만 적용돼."
        ariaLabel="변경 시간표 추가"
        className="change-editor timetable-unified-sheet"
      >
        <div className="change-form">
""", 'timetable sheet start')
t = once(t, """          </div>
        </section>
      ) : null}

      {!editing && weekChanges.length ? (
""", """        </div>
      </UnifiedBottomSheet>

      {!editing && weekChanges.length ? (
""", 'timetable sheet end')
write(p, t)


# Academic modal: remove its private backdrop/close timer and use the exact same component.
p = 'src/academic-shared.jsx'
t = read(p)
t = once(t, "import './academic-shared.css'\n", "import './academic-shared.css'\nimport { UnifiedBottomSheet } from './unified-sheet.jsx'\n", 'academic import')
t = t.replace("const SHEET_CLOSE_MS = 320\n\n", '')
t = t.replace("  const [sheetClosing, setSheetClosing] = useState(false)\n", '')
t = t.replace("  const closeTimerRef = useRef(null)\n", '')
start = t.find("  useEffect(() => () => {\n    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)")
end = t.find("  function openCreate() {\n", start)
if start < 0 or end < 0:
    raise SystemExit('Missing academic close engine')
t = t[:start] + """  function openSheet(nextDraft) {
    setDraft(nextDraft)
    setError('')
    setSheetOpen(true)
  }

  function closeSheet() {
    if (!sheetOpen || saving) return
    setSheetOpen(false)
  }

  function closeAfterSave() {
    setSheetOpen(false)
  }

""" + t[end:]
t = once(t, """      {sheetOpen ? (
        <>
          <div
            className={`academic-sheet-backdrop ${sheetClosing ? 'is-closing' : ''}`}
            aria-hidden="true"
            onClick={closeSheet}
          />
          <section
            className={`change-editor academic-editor ${sheetClosing ? 'is-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? '학사일정 수정' : '학사일정 추가'}
          >
            <div className="change-editor-head academic-editor-head">
              <h2>{draft.id ? '학사일정 수정' : '학사일정 추가'}</h2>
              <button className="academic-sheet-close" type="button" onClick={closeSheet} disabled={saving} aria-label="닫기">×</button>
            </div>
            <div className="change-form academic-form">
""", """      <UnifiedBottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        closeDisabled={saving}
        title={draft.id ? '학사일정 수정' : '학사일정 추가'}
        ariaLabel={draft.id ? '학사일정 수정' : '학사일정 추가'}
        className="change-editor academic-editor"
      >
        <div className="change-form academic-form">
""", 'academic sheet start')
t = once(t, """            </div>
          </section>
        </>
      ) : null}
    </section>
  )
}
""", """        </div>
      </UnifiedBottomSheet>
    </section>
  )
}
""", 'academic sheet end')
write(p, t)


# Reminder boot state: do not render a half-updated shared/personal pair.
p = 'src/todo.jsx'
t = read(p)
t = once(t, """const PERSONAL_TODO_STATE_CACHE_VERSION = 'v1'

function sharedTodosCacheKey(profile) {
""", """const PERSONAL_TODO_STATE_CACHE_VERSION = 'v1'
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
""", 'visible cache helpers')
t = once(t, """  const [sharedTodos, setSharedTodos] = useState(() => readSharedTodosCache(profile))
  const [personalState, setPersonalState] = useState(() => readPersonalTodoStateCache(profile))
  const todos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])
""", """  const [sharedTodos, setSharedTodos] = useState(() => readSharedTodosCache(profile))
  const [personalState, setPersonalState] = useState(() => readPersonalTodoStateCache(profile))
  const [bootTodos, setBootTodos] = useState(() => readVisibleTodosCache(profile) ?? mergeSharedTodos(readSharedTodosCache(profile), readPersonalTodoStateCache(profile)))
  const [remoteReady, setRemoteReady] = useState(false)
  const firstRemoteReadyRef = useRef(false)
  const remoteSharedRef = useRef(null)
  const remotePersonalRef = useRef(null)
  const mergedTodos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])
  const todos = remoteReady ? mergedTodos : bootTodos

  useEffect(() => {
    writeVisibleTodosCache(profile, todos)
  }, [signature, todos])
""", 'boot state')
t = once(t, """    let disposed = false
    setSharedTodos(readSharedTodosCache(profile))
    setPersonalState(readPersonalTodoStateCache(profile))

    const stopClassTodos = listenClassTodos(
      profile,
      (remoteTodos) => {
        if (disposed) return
        const next = remoteTodos.map(sharedTodoShape)
        writeSharedTodosCache(profile, next)
        setSharedTodos(next)
      },
""", """    let disposed = false
    const cachedShared = readSharedTodosCache(profile)
    const cachedPersonal = readPersonalTodoStateCache(profile)
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
      setSharedTodos(nextShared)
      setPersonalState(nextPersonal)
      const nextVisible = mergeSharedTodos(nextShared, nextPersonal)
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
        if (firstRemoteReadyRef.current) setSharedTodos(next)
        else commitFirstRemotePair()
      },
""", 'class listener barrier')
t = once(t, """      (remoteState) => {
        if (disposed) return
        const next = normalizePersonalTodoState(remoteState)
        writePersonalTodoStateCache(profile, next)
        setPersonalState(next)
      },
""", """      (remoteState) => {
        if (disposed) return
        const next = normalizePersonalTodoState(remoteState)
        writePersonalTodoStateCache(profile, next)
        remotePersonalRef.current = next
        if (firstRemoteReadyRef.current) setPersonalState(next)
        else commitFirstRemotePair()
      },
""", 'personal listener barrier')
t = once(t, """  function updateSharedTodos(updater) {
    setSharedTodos((current) => {
      const next = updater(current)
      writeSharedTodosCache(profile, next)
      return next
    })
  }
""", """  function updateSharedTodos(updater) {
    setSharedTodos((current) => {
      const next = updater(current)
      writeSharedTodosCache(profile, next)
      if (!firstRemoteReadyRef.current) {
        const nextVisible = mergeSharedTodos(next, personalState)
        setBootTodos(nextVisible)
        writeVisibleTodosCache(profile, nextVisible)
      }
      return next
    })
  }
""", 'optimistic shared cache')
t = once(t, """    setPersonalState((current) => {
      const next = { ...current, [id]: nextEntry }
      writePersonalTodoStateCache(profile, next)
      return next
    })
""", """    setPersonalState((current) => {
      const next = { ...current, [id]: nextEntry }
      writePersonalTodoStateCache(profile, next)
      const nextVisible = mergeSharedTodos(sharedTodos, next)
      writeVisibleTodosCache(profile, nextVisible)
      if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)
      return next
    })
""", 'optimistic personal cache')
t = once(t, """        writePersonalTodoStateCache(profile, next)
        return next
      })
""", """        writePersonalTodoStateCache(profile, next)
        const nextVisible = mergeSharedTodos(sharedTodos, next)
        writeVisibleTodosCache(profile, nextVisible)
        if (!firstRemoteReadyRef.current) setBootTodos(nextVisible)
        return next
      })
""", 'rollback visible cache')
write(p, t)


# Row-owned motion CSS; no animation cancellation across repeated actions.
p = 'src/todo-stage5.css'
t = read(p)
if 'Interrupt-safe reminder motion' not in t:
    t += """

/* Interrupt-safe reminder motion. */
.todo-stage5 .todo-item {
  max-height: 180px;
  overflow: hidden;
  animation: reminder-row-mount 440ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes reminder-row-mount {
  from { opacity: 0; transform: translate3d(0, 7px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

.todo-stage5 .todo-item.is-state-entering {
  animation: reminder-row-mount 440ms cubic-bezier(0.16, 1, 0.3, 1) both !important;
}

@keyframes reminder-row-collapse {
  from { max-height: 180px; min-height: 78px; opacity: 1; transform: translate3d(0, 0, 0); }
  to { max-height: 0; min-height: 0; opacity: 0; transform: translate3d(0, -5px, 0); }
}

.todo-stage5 .todo-item.is-state-leaving {
  pointer-events: none;
  overflow: hidden;
  animation: reminder-row-collapse 280ms cubic-bezier(0.4, 0, 1, 1) both !important;
}
"""
write(p, t)

p = 'src/academic-shared.css'
t = read(p)
if 'academic-item-collapse-out' not in t:
    t += """

@keyframes academic-item-collapse-out {
  from { max-height: 180px; opacity: 1; transform: translate3d(0, 0, 0); }
  to { max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; transform: translate3d(0, -5px, 0); }
}

.academic-list-item.is-deleting {
  overflow: hidden;
  pointer-events: none;
  animation: academic-item-collapse-out 260ms cubic-bezier(0.4, 0, 1, 1) both !important;
}
"""
write(p, t)

# Architecture checks.
for file, markers in {
    'src/todo-stage5-ai.jsx': ['<UnifiedBottomSheet', 'animateToggleTodo', 'is-state-leaving'],
    'src/main.jsx': ['timetable-unified-sheet', '<UnifiedBottomSheet'],
    'src/academic-shared.jsx': ['className="change-editor academic-editor"', '<UnifiedBottomSheet'],
    'src/todo.jsx': ['VISIBLE_TODOS_CACHE_VERSION', 'commitFirstRemotePair', 'setRemoteReady(true)'],
}.items():
    content = read(file)
    for marker in markers:
        if marker not in content:
            raise SystemExit(f'Verification failed: {marker} missing from {file}')
