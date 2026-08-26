import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return text.slice(0, first) + to + text.slice(first + from.length)
}

function replaceRange(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker)
  if (start < 0) throw new Error(`Missing start guard: ${label}`)
  if (text.indexOf(startMarker, start + startMarker.length) >= 0) throw new Error(`Ambiguous start guard: ${label}`)
  const end = text.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error(`Missing end guard: ${label}`)
  return text.slice(0, start) + replacement + text.slice(end)
}

{
  const path = 'src/todo.jsx'
  let text = fs.readFileSync(path, 'utf8')

  text = replaceOnce(
    text,
    `import {
  getReminderOriginal,
  listenClassTodos,
  listenStudentTodoState,
  profileSignature,
  writeReminderOriginal,
  writeSharedTodo,
  writeStudentTodoState,
} from './school-sync'`,
    `import {
  classKeyFor,
  getReminderOriginal,
  listenClassTodos,
  profileSignature,
  studentKeyFor,
  writeReminderOriginal,
  writeSharedTodo,
} from './school-sync'`,
    'todo school-sync imports',
  )

  const idHelper = `function createTodoId() {
  const now = Date.now()
  return \`${'${now}'}-${'${Math.random().toString(36).slice(2, 8)}'}\`
}`
  const localStateHelpers = `${idHelper}

const LOCAL_TODO_STATE_VERSION = 'v2'

function localTodoStateKey(profile) {
  const classKey = classKeyFor(profile)
  const studentKey = studentKeyFor(profile)
  return classKey && studentKey ? \`school.todoState.${'${LOCAL_TODO_STATE_VERSION}'}.${'${classKey}'}.${'${studentKey}'}\` : ''
}

function normalizeLocalTodoState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized = {}
  Object.entries(value).forEach(([id, state]) => {
    if (!id || !state || typeof state !== 'object') return
    normalized[id] = {
      completed: Boolean(state.completed),
      hidden: Boolean(state.hidden),
      updatedAt: Number(state.updatedAt || 0),
    }
  })
  return normalized
}

function readLocalTodoState(profile) {
  const key = localTodoStateKey(profile)
  if (!key) return {}
  try {
    return normalizeLocalTodoState(JSON.parse(localStorage.getItem(key) || '{}'))
  } catch {
    return {}
  }
}

function writeLocalTodoState(profile, state) {
  const key = localTodoStateKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(normalizeLocalTodoState(state)))
  } catch {
    // Completion/deletion are intentionally device-local; storage failure should not touch class data.
  }
}`
  text = replaceOnce(text, idHelper, localStateHelpers, 'device-local reminder state helpers')

  text = replaceRange(
    text,
    `export function useTodos(profile) {`,
    `  function saveTodo(input) {`,
    `export function useTodos(profile) {
  const [sharedTodos, setSharedTodos] = useState([])
  const [personalState, setPersonalState] = useState(() => readLocalTodoState(profile))
  const signature = profileSignature(profile)
  const todos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])

  useEffect(() => {
    try { localStorage.removeItem('school.todos.v1') } catch { /* stale cache cleanup is best-effort */ }
  }, [])

  useEffect(() => {
    setPersonalState(readLocalTodoState(profile))
  }, [signature])

  useEffect(() => {
    if (!signature) {
      setSharedTodos([])
      return undefined
    }

    let disposed = false
    const stopClassTodos = listenClassTodos(
      profile,
      (remoteTodos) => {
        if (disposed) return
        setSharedTodos(remoteTodos.map(sharedTodoShape))
      },
      (error) => console.error('Class reminder sync failed:', error),
    )

    return () => {
      disposed = true
      stopClassTodos()
    }
  }, [signature])

`,
    'useTodos realtime source split',
  )

  text = replaceRange(
    text,
    `  function saveTodo(input) {`,
    `  function toggleTodo(id) {`,
    `  async function saveTodo(input) {
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
      await writeSharedTodo(profile, nextTodo)
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
    await writeSharedTodo(profile, todo)
    recordClassActivity(profile, 'reminder', todo.id, 'added')
      .catch((error) => console.error('Reminder attribution create failed:', error))
    return todo.id
  }

`,
    'server-authoritative reminder save',
  )

  text = replaceRange(
    text,
    `  function toggleTodo(id) {`,
    `  function uploadOriginalAttachment(todoId, file) {`,
    `  function toggleTodo(id) {
    const target = todos.find((todo) => todo.id === id)
    if (!target) return
    const completed = !target.completed
    setPersonalState((current) => {
      const next = {
        ...current,
        [id]: {
          ...current[id],
          completed,
          hidden: false,
          updatedAt: Date.now(),
        },
      }
      writeLocalTodoState(profile, next)
      return next
    })
  }

  function removeTodo(id) {
    setPersonalState((current) => {
      const next = {
        ...current,
        [id]: {
          ...current[id],
          completed: Boolean(current[id]?.completed),
          hidden: true,
          updatedAt: Date.now(),
        },
      }
      writeLocalTodoState(profile, next)
      return next
    })
  }

`,
    'device-local reminder completion and delete',
  )

  text = replaceOnce(
    text,
    `  const [deletingId, setDeletingId] = useState('')
  const pageRef = useRef(null)`,
    `  const [deletingId, setDeletingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const pageRef = useRef(null)`,
    'reminder save state',
  )

  text = replaceOnce(
    text,
    `  function openCreate() {
    setDraft(emptyDraft(now))
    setSheetOpen(true)
  }`,
    `  function openCreate() {
    setDraft(emptyDraft(now))
    setSaveError('')
    setSheetOpen(true)
  }`,
    'reset create save error',
  )

  text = replaceOnce(
    text,
    `  function openEdit(todo) {
    setDraft({
      id: todo.id,
      type: todo.type,
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime || '',
    })
    setSheetOpen(true)
  }`,
    `  function openEdit(todo) {
    setDraft({
      id: todo.id,
      type: todo.type,
      title: todo.title,
      dueDate: todo.dueDate,
      dueTime: todo.dueTime || '',
    })
    setSaveError('')
    setSheetOpen(true)
  }`,
    'reset edit save error',
  )

  text = replaceOnce(
    text,
    `  function submitTodo() {
    const savedId = saveTodo(draft)
    if (!savedId) return
    setSheetOpen(false)
  }`,
    `  async function submitTodo() {
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
  }`,
    'await reminder server save',
  )

  text = replaceOnce(
    text,
    `            <div className="change-submit-row">`,
    `            {saveError ? <p className="change-warning">{saveError}</p> : null}

            <div className="change-submit-row">`,
    'reminder save error message',
  )

  text = replaceOnce(
    text,
    `                disabled={!draft.title.trim() || !draft.dueDate}
                onClick={submitTodo}
              >
                저장
              </button>`,
    `                disabled={saving || !draft.title.trim() || !draft.dueDate}
                onClick={submitTodo}
              >
                {saving ? '저장 중…' : '저장'}
              </button>`,
    'reminder save button state',
  )

  fs.writeFileSync(path, text)
}

{
  const path = 'src/school-sync.js'
  let text = fs.readFileSync(path, 'utf8')

  text = replaceOnce(
    text,
    `  const commitWeeklySchedule = useCallback((nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    saveWeeklySchedule(normalized)
    setWeeklySchedule(normalized)
    writeWeeklyScheduleCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable save failed:', error))
  }, [signature])`,
    `  const commitWeeklySchedule = useCallback(async (nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    try {
      await writeWeeklyScheduleCloud(profile, normalized)
      saveWeeklySchedule(normalized)
      setWeeklySchedule(normalized)
      return true
    } catch (error) {
      console.error('Shared timetable save failed:', error)
      return false
    }
  }, [signature])`,
    'server-authoritative weekly timetable save',
  )

  text = replaceOnce(
    text,
    `  const commitOverrides = useCallback((nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    saveOverrides(normalized)
    setOverrides(normalized)
    writeOverridesCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable override save failed:', error))
  }, [signature, now])`,
    `  const commitOverrides = useCallback(async (nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    try {
      await writeOverridesCloud(profile, normalized)
      saveOverrides(normalized)
      setOverrides(normalized)
      return true
    } catch (error) {
      console.error('Shared timetable override save failed:', error)
      return false
    }
  }, [signature, now])`,
    'server-authoritative timetable override save',
  )

  fs.writeFileSync(path, text)
}

{
  const path = 'src/main.jsx'
  let text = fs.readFileSync(path, 'utf8')

  text = replaceOnce(
    text,
    `        <p className="onboarding-copy">같은 반끼리 시간표·리마인더·학사일정을 공유해. 완료와 삭제는 같은 학생의 기기끼리만 이어져.</p>`,
    `        <p className="onboarding-copy">같은 반끼리 시간표·리마인더·학사일정을 공유해. 리마인더 완료와 삭제는 이 기기에만 저장돼.</p>`,
    'onboarding sync description',
  )

  text = replaceOnce(text, `  function saveBaseSchedule() {`, `  async function saveBaseSchedule() {`, 'await weekly timetable save function')
  text = replaceOnce(
    text,
    `    onSaveWeekly(draft)
    recordClassActivities(profile, [
      { entityType: 'timetable', entityId: 'weekly', action: 'edited' },
      ...changedCells.map(({ dayId, period }) => ({
        entityType: 'timetable',
        entityId: 'base-' + dayId + '-' + period,
        action: 'edited',
      })),
    ]).catch((error) => console.error('Timetable attribution save failed:', error))
    setEditing(false)`,
    `    const saved = await onSaveWeekly(draft)
    if (!saved) return
    recordClassActivities(profile, [
      { entityType: 'timetable', entityId: 'weekly', action: 'edited' },
      ...changedCells.map(({ dayId, period }) => ({
        entityType: 'timetable',
        entityId: 'base-' + dayId + '-' + period,
        action: 'edited',
      })),
    ]).catch((error) => console.error('Timetable attribution save failed:', error))
    setEditing(false)`,
    'weekly timetable save acknowledgement',
  )

  text = replaceOnce(text, `  function saveChange() {`, `  async function saveChange() {`, 'await timetable override save function')
  text = replaceOnce(
    text,
    `    onSaveOverrides(next)
    recordClassActivities(profile, [{
      entityType: 'timetable',
      entityId: \`${'${changeDate}'}-${'${changePeriod}'}\`,
      action: activityAction,
    }]).catch((error) => console.error('Timetable change attribution save failed:', error))
    setChangeSubject('')
    setChangeOpen(false)`,
    `    const saved = await onSaveOverrides(next)
    if (!saved) return
    recordClassActivities(profile, [{
      entityType: 'timetable',
      entityId: \`${'${changeDate}'}-${'${changePeriod}'}\`,
      action: activityAction,
    }]).catch((error) => console.error('Timetable change attribution save failed:', error))
    setChangeSubject('')
    setChangeOpen(false)`,
    'timetable override save acknowledgement',
  )

  text = replaceOnce(text, `  function removeChange(targetDate, period) {`, `  async function removeChange(targetDate, period) {`, 'await timetable revert function')
  text = replaceOnce(
    text,
    `    onSaveOverrides(next)
  }

  function clearAllChanges() {
    if (!Object.keys(overrides || {}).length) return
    onSaveOverrides({})
  }`,
    `    await onSaveOverrides(next)
  }

  async function clearAllChanges() {
    if (!Object.keys(overrides || {}).length) return
    await onSaveOverrides({})
  }`,
    'await timetable revert writes',
  )

  fs.writeFileSync(path, text)
}

{
  const path = 'public/sw.js'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "const CACHE_NAME = 'school-shell-v93'", "const CACHE_NAME = 'school-shell-v94'", 'service worker cache refresh')
  fs.writeFileSync(path, text)
}

for (const [path, required, forbidden = null] of [
  ['src/todo.jsx', 'LOCAL_TODO_STATE_VERSION', 'listenStudentTodoState'],
  ['src/todo.jsx', 'await writeSharedTodo(profile, todo)', 'writeStudentTodoState(profile'],
  ['src/school-sync.js', 'await writeWeeklyScheduleCloud(profile, normalized)'],
  ['src/school-sync.js', 'await writeOverridesCloud(profile, normalized)'],
  ['src/main.jsx', '리마인더 완료와 삭제는 이 기기에만 저장돼.'],
  ['public/sw.js', "school-shell-v94"],
]) {
  const text = fs.readFileSync(path, 'utf8')
  if (!text.includes(required)) throw new Error(`Verification failed: ${path} missing ${required}`)
  if (forbidden && text.includes(forbidden)) throw new Error(`Verification failed: ${path} still contains ${forbidden}`)
}
