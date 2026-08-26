from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


# --- src/todo.jsx: fast cached shared reminders + per-student server state ---
path = 'src/todo.jsx'
text = read(path)
old_import = """  listenClassTodos,
  profileSignature,
  studentKeyFor,
  writeReminderOriginal,
  writeSharedTodo,
"""
new_import = """  listenClassTodos,
  listenStudentTodoState,
  profileSignature,
  writeReminderOriginal,
  writeSharedTodo,
  writeStudentTodoState,
"""
assert old_import in text, 'todo import guard failed'
text = text.replace(old_import, new_import, 1)

start = text.index("const LOCAL_TODO_STATE_VERSION = 'v2'")
end = text.index("\n\nexport function useTodos(profile)", start)
cache_block = r"""const SHARED_TODOS_CACHE_VERSION = 'v1'

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
}"""
text = text[:start] + cache_block + text[end:]

use_start = text.index('export function useTodos(profile) {')
use_end = text.index('\n\nfunction typeLabel(typeId)', use_start)
new_use = r"""export function useTodos(profile) {
  const signature = profileSignature(profile)
  const [sharedTodos, setSharedTodos] = useState(() => readSharedTodosCache(profile))
  const [personalState, setPersonalState] = useState({})
  const todos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])

  useEffect(() => {
    try { localStorage.removeItem('school.todos.v1') } catch { /* stale cache cleanup is best-effort */ }
  }, [])

  useEffect(() => {
    if (!signature) {
      setSharedTodos([])
      setPersonalState({})
      return undefined
    }

    let disposed = false
    setSharedTodos(readSharedTodosCache(profile))
    setPersonalState({})

    const stopClassTodos = listenClassTodos(
      profile,
      (remoteTodos) => {
        if (disposed) return
        const next = remoteTodos.map(sharedTodoShape)
        writeSharedTodosCache(profile, next)
        setSharedTodos(next)
      },
      (error) => console.error('Class reminder sync failed:', error),
    )

    const stopPersonalState = listenStudentTodoState(
      profile,
      (remoteState) => {
        if (disposed) return
        setPersonalState(remoteState)
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
      writeSharedTodosCache(profile, next)
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

  function updatePersonalStateOnServer(id, nextEntry, previousEntry) {
    setPersonalState((current) => ({ ...current, [id]: nextEntry }))
    writeStudentTodoState(profile, id, nextEntry).catch((error) => {
      console.error('Personal reminder state save failed:', error)
      setPersonalState((current) => {
        if (current[id]?.updatedAt !== nextEntry.updatedAt) return current
        const next = { ...current }
        if (previousEntry) next[id] = previousEntry
        else delete next[id]
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

  function uploadOriginalAttachment(todoId, file) {
    return writeReminderOriginal(profile, todoId, file)
  }

  function getOriginalAttachment(todoId) {
    return getReminderOriginal(profile, todoId)
  }

  return {
    todos,
    saveTodo,
    toggleTodo,
    removeTodo,
    createTodoId,
    uploadOriginalAttachment,
    getOriginalAttachment,
  }
}"""
text = text[:use_start] + new_use + text[use_end:]
write(path, text)


# --- src/todo-stage5-ai.jsx: close as soon as optimistic save starts; reopen on failure ---
path = 'src/todo-stage5-ai.jsx'
text = read(path)
start = text.index('  async function submitNatural() {')
end = text.index('\n\n  function submitCurrent()', start)
replacement = r"""  async function submitNatural() {
    if (!naturalResult?.title || !naturalResult?.dueDate || originalSaving || serverSaving) return
    const createId = pendingCreateIdRef.current || createTodoId()
    pendingCreateIdRef.current = createId

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

    setServerSaving(true)
    setServerSaveError('')
    const savePromise = saveTodo({
      id: '',
      createId,
      type: naturalResult.type,
      title: naturalResult.title,
      dueDate: naturalResult.dueDate,
      dueTime: naturalResult.dueTime || '',
      summary: naturalResult.summary || null,
      attachment: naturalResult.attachment || null,
    })
    setSheetOpen(false)

    try {
      const savedId = await savePromise
      if (!savedId) {
        setSheetOpen(true)
        return
      }
      pendingCreateIdRef.current = ''
      resetAI()
    } catch (error) {
      console.error('Shared reminder save failed:', error)
      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')
      setSheetOpen(true)
    } finally {
      setServerSaving(false)
    }
  }

  async function submitManual() {
    if (serverSaving) return
    const createId = draft.id ? '' : (pendingCreateIdRef.current || createTodoId())
    if (createId) pendingCreateIdRef.current = createId
    setServerSaving(true)
    setServerSaveError('')
    const savePromise = saveTodo(createId ? { ...draft, createId } : draft)
    setSheetOpen(false)

    try {
      const savedId = await savePromise
      if (!savedId) {
        setSheetOpen(true)
        return
      }
      pendingCreateIdRef.current = ''
    } catch (error) {
      console.error('Shared reminder save failed:', error)
      setServerSaveError('서버에 저장하지 못했어. 인터넷 연결을 확인하고 다시 눌러줘.')
      setSheetOpen(true)
    } finally {
      setServerSaving(false)
    }
  }"""
text = text[:start] + replacement + text[end:]
write(path, text)


# --- src/school-sync.js: shared auth, no duplicate startup reads, fast timetable cache ---
path = 'src/school-sync.js'
text = read(path)
old_import = """  normalizeOverrides,
  normalizeWeeklySchedule,
  pruneExpiredOverrides,
  saveOverrides,
  saveWeeklySchedule,
"""
new_import = """  loadOverrides,
  loadWeeklySchedule,
  normalizeOverrides,
  normalizeWeeklySchedule,
  pruneExpiredOverrides,
  saveOverrides,
  saveWeeklySchedule,
"""
assert old_import in text, 'sync timetable import guard failed'
text = text.replace(old_import, new_import, 1)
text = text.replace('async function ensureSignedIn() {', 'export async function ensureSignedIn() {', 1)

old_state_write = """    updatedAt: Date.now(),
  }, { merge: true })
}

export async function migrateLegacyTodos"""
new_state_write = """    updatedAt: Number(state?.updatedAt || Date.now()),
  }, { merge: true })
}

export async function migrateLegacyTodos"""
assert old_state_write in text, 'personal state timestamp guard failed'
text = text.replace(old_state_write, new_state_write, 1)

old_init = """  const [weeklySchedule, setWeeklySchedule] = useState(() => normalizeWeeklySchedule(null))
  const [overrides, setOverrides] = useState({})"""
new_init = """  const [weeklySchedule, setWeeklySchedule] = useState(() => loadWeeklySchedule())
  const [overrides, setOverrides] = useState(() => pruneExpiredOverrides(loadOverrides(), now))"""
assert old_init in text, 'timetable initial state guard failed'
text = text.replace(old_init, new_init, 1)

count = text.count('      refreshFromServer()\n')
assert count >= 3, f'expected >=3 school-sync startup refreshes, found {count}'
text = text.replace('      refreshFromServer()\n', '')
write(path, text)


# --- src/class-activity.js: shared auth + academic cache + no duplicate startup reads ---
path = 'src/class-activity.js'
text = read(path)
auth_import = "import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from 'firebase/auth'\n"
assert auth_import in text, 'class activity auth import guard failed'
text = text.replace(auth_import, '', 1)
old_import = """  classKeyFor,
  normalizeStudentProfile,
"""
new_import = """  classKeyFor,
  ensureSignedIn,
  normalizeStudentProfile,
"""
assert old_import in text, 'class activity school-sync import guard failed'
text = text.replace(old_import, new_import, 1)

start = text.index('const auth = getAuth(syncApp)')
end = text.index('\n\nfunction installServerRevalidation', start)
text = text[:start] + 'const db = getFirestore(syncApp)' + text[end:]

marker = """function newAcademicId() {
  return `academic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
"""
assert marker in text, 'academic id marker missing'
cache_helpers = marker + r"""
const ACADEMIC_CACHE_VERSION = 'v1'

function academicCacheKey(profile) {
  const normalized = currentProfile(profile)
  const classKey = classKeyFor(normalized)
  return classKey ? `school.academicEvents.${ACADEMIC_CACHE_VERSION}.${classKey}` : ''
}

function readAcademicCache(profile) {
  const key = academicCacheKey(profile)
  if (!key) return []
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(stored)
      ? stored.map(safeAcademicEvent).filter(Boolean).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
      : []
  } catch {
    return []
  }
}

function writeAcademicCache(profile, events) {
  const key = academicCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(events || []))
  } catch {
    // Cache only accelerates first paint. Firestore remains authoritative.
  }
}
"""
text = text.replace(marker, cache_helpers, 1)

old_state = """  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!signature) return undefined"""
new_state = """  const [events, setEvents] = useState(() => readAcademicCache(normalized))

  useEffect(() => {
    if (!signature) return undefined
    setEvents(readAcademicCache(normalized))"""
assert old_state in text, 'academic state guard failed'
text = text.replace(old_state, new_state, 1)

old_apply = """      generation += 1
      setEvents(academicEventsFromSnapshot(snapshot))"""
new_apply = """      generation += 1
      const next = academicEventsFromSnapshot(snapshot)
      writeAcademicCache(normalized, next)
      setEvents(next)"""
assert old_apply in text, 'academic apply guard failed'
text = text.replace(old_apply, new_apply, 1)

count = text.count('        refreshFromServer()\n')
assert count >= 2, f'expected >=2 class activity startup refreshes, found {count}'
text = text.replace('        refreshFromServer()\n', '')
write(path, text)


# --- iPhone timetable bottom sheet: match Reminder geometry ---
path = 'public/school-sheet.css'
text = read(path)
assert 'iPhone: use the same edge-to-edge bottom-sheet geometry as Reminder.' not in text
text += r"""

/* iPhone: use the same edge-to-edge bottom-sheet geometry as Reminder. */
@media (max-width: 699px) {
  body .timetable-page .change-editor {
    bottom: 0;
    width: min(calc(100% - 16px), 660px);
    max-height: min(82dvh, 720px);
    padding: 8px 18px max(18px, env(safe-area-inset-bottom));
    border-bottom: 0;
    border-radius: 28px 28px 0 0;
    background: var(--surface);
    box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.13);
  }

  body .timetable-page .change-editor .change-editor-head {
    position: sticky;
    top: 0;
    z-index: 3;
    min-height: 0;
    padding: 26px 48px 18px 2px;
    background: var(--surface);
  }

  body .timetable-page .change-editor .change-editor-head::before {
    top: 7px;
  }
}
"""
write(path, text)


# --- iPhone academic bottom sheet: match Reminder geometry ---
path = 'src/academic-shared.css'
text = read(path)
assert "iPhone: match Reminder's bottom sheet" not in text
text += r"""

/* iPhone: match Reminder's bottom sheet and keep controls above the home indicator. */
@media (max-width: 699px) {
  body .academic-editor {
    bottom: 0;
    width: min(calc(100% - 16px), 660px);
    max-height: min(82dvh, 720px);
    padding: 8px 18px max(18px, env(safe-area-inset-bottom));
    border-bottom: 0;
    border-radius: 28px 28px 0 0;
    background: var(--surface);
    box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.13);
  }

  .academic-editor-head {
    position: sticky;
    top: 0;
    z-index: 3;
    padding: 18px 48px 14px 2px;
    background: var(--surface);
  }
}
"""
write(path, text)


# --- disable pinch zoom ---
path = 'index.html'
text = read(path)
old = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />'
new = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />'
assert old in text, 'viewport guard failed'
text = text.replace(old, new, 1)
write(path, text)

path = 'src/main.jsx'
text = read(path)
marker = "if (MOBILE_BROWSER_COMPAT) document.documentElement.classList.add('school-mobile-compat')\n"
assert marker in text, 'main mobile marker missing'
pinch = marker + r"""

if (!window.__schoolPinchZoomBlocked) {
  window.__schoolPinchZoomBlocked = true
  const preventGestureZoom = (event) => event.preventDefault()
  const preventMultiTouchZoom = (event) => {
    if (event.touches?.length > 1) event.preventDefault()
  }
  document.addEventListener('gesturestart', preventGestureZoom, { passive: false })
  document.addEventListener('gesturechange', preventGestureZoom, { passive: false })
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })
}
"""
text = text.replace(marker, pinch, 1)
write(path, text)


# Final guards
todo = read('src/todo.jsx')
assert 'listenStudentTodoState' in todo and 'writeStudentTodoState' in todo
assert 'writeLocalTodoState(profile' not in todo
assert 'writeSharedTodosCache(profile, next)' in todo
stage5 = read('src/todo-stage5-ai.jsx')
assert 'const savePromise = saveTodo' in stage5 and 'setSheetOpen(false)' in stage5
sync = read('src/school-sync.js')
assert 'export async function ensureSignedIn()' in sync
assert 'loadWeeklySchedule()' in sync and 'loadOverrides()' in sync
activity = read('src/class-activity.js')
assert "from 'firebase/auth'" not in activity
assert 'readAcademicCache(normalized)' in activity
assert 'user-scalable=no' in read('index.html')
assert '__schoolPinchZoomBlocked' in read('src/main.jsx')
