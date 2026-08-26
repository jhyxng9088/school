from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 marker, found {count}')
    return text.replace(old, new, 1)

# --- todo.jsx: exact KST expiry + shared server delete attempt ---
p = Path('src/todo.jsx')
t = p.read_text()
t = replace_once(
    t,
    "  classKeyFor,\n  getReminderOriginal,",
    "  classKeyFor,\n  deleteExpiredSharedTodo,\n  getReminderOriginal,",
    'todo sync import',
)
parse_marker = "function parseDue(todo) {\n  const time = todo.dueTime || '23:59'\n  return new Date(`${todo.dueDate}T${time}:00`)\n}\n"
if parse_marker not in t:
    raise SystemExit('parseDue marker missing')
expiry_helpers = """

function todoExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) return Number.POSITIVE_INFINITY
  const expiry = Date.parse(`${dueDate}T23:59:59.000+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}

function isTodoExpired(todo, nowMs = Date.now()) {
  return todoExpiryMs(todo) <= nowMs
}

function visibleUnexpiredTodos(todos, nowMs = Date.now()) {
  return (todos || []).filter((todo) => !isTodoExpired(todo, nowMs))
}
"""
t = t.replace(parse_marker, parse_marker + expiry_helpers, 1)
state_old = "  const [remoteReady, setRemoteReady] = useState(false)\n  const firstRemoteReadyRef = useRef(false)"
state_new = "  const [remoteReady, setRemoteReady] = useState(false)\n  const [expiryClock, setExpiryClock] = useState(() => Date.now())\n  const expiryDeleteAttemptsRef = useRef(new Set())\n  const firstRemoteReadyRef = useRef(false)"
t = replace_once(t, state_old, state_new, 'expiry clock state')
calc_old = "  const mergedTodos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])\n  const todos = remoteReady ? mergedTodos : bootTodos\n"
calc_new = "  const mergedTodos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])\n  const sourceTodos = remoteReady ? mergedTodos : bootTodos\n  const todos = useMemo(() => visibleUnexpiredTodos(sourceTodos, expiryClock), [sourceTodos, expiryClock])\n"
t = replace_once(t, calc_old, calc_new, 'visible expiry filter')
effect_marker = "  useEffect(() => {\n    writeVisibleTodosCache(profile, todos)\n  }, [signature, todos])\n"
if effect_marker not in t:
    raise SystemExit('visible cache effect marker missing')
expiry_effects = """

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
"""
t = t.replace(effect_marker, effect_marker + expiry_effects, 1)
first_pair_old = "      const nextVisible = mergeSharedTodos(nextShared, nextPersonal)\n      writeVisibleTodosCache(profile, nextVisible)"
first_pair_new = "      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(nextShared, nextPersonal))\n      writeVisibleTodosCache(profile, nextVisible)"
t = replace_once(t, first_pair_old, first_pair_new, 'first remote expiry cache')
t = t.replace(
    "      const nextVisible = mergeSharedTodos(sharedTodos, next)\n      writeVisibleTodosCache(profile, nextVisible)",
    "      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(sharedTodos, next))\n      writeVisibleTodosCache(profile, nextVisible)",
)
p.write_text(t.rstrip() + '\n')

# --- school-sync.js: shared delete call. Firestore Rules decide whether it is expired. ---
p = Path('src/school-sync.js')
t = p.read_text()
t = replace_once(
    t,
    "  collection,\n  doc,",
    "  collection,\n  deleteDoc,\n  doc,",
    'deleteDoc import',
)
write_marker = "export async function writeSharedTodo(profile, todo) {\n  const normalized = safeSharedTodo(todo)\n  if (!normalized) throw new Error('Invalid shared reminder')\n  await ensureSignedIn()\n  await setDoc(classTodoRef(profile, normalized.id), normalized, { merge: true })\n}\n"
if write_marker not in t:
    raise SystemExit('writeSharedTodo marker missing')
delete_fn = """

export async function deleteExpiredSharedTodo(profile, todoId) {
  const id = String(todoId || '').trim()
  if (!id) return false
  await ensureSignedIn()
  await deleteDoc(classTodoRef(profile, id))
  return true
}
"""
t = t.replace(write_marker, write_marker + delete_fn, 1)
p.write_text(t.rstrip() + '\n')

# --- firestore.rules: allow delete only after dueDate 23:59:59 KST ---
p = Path('firestore.rules')
t = p.read_text()
rules_marker = "    function validTimetable() {\n"
if rules_marker not in t:
    raise SystemExit('rules insertion marker missing')
expiry_rule = """    function reminderExpiredInKorea() {
      let due = resource.data.dueDate;
      let kstNow = request.time + duration.value(9, 'h');
      let dueYear = int(due[0:4]);
      let dueMonth = int(due[5:7]);
      let dueDay = int(due[8:10]);
      let datePassed = kstNow.year() > dueYear
        || (kstNow.year() == dueYear && kstNow.month() > dueMonth)
        || (kstNow.year() == dueYear && kstNow.month() == dueMonth && kstNow.day() > dueDay);
      let finalSecond = kstNow.year() == dueYear
        && kstNow.month() == dueMonth
        && kstNow.day() == dueDay
        && kstNow.hours() == 23
        && kstNow.minutes() == 59
        && kstNow.seconds() >= 59;
      return due is string
        && due.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && (datePassed || finalSecond);
    }

"""
t = t.replace(rules_marker, expiry_rule + rules_marker, 1)
t = replace_once(
    t,
    "      allow delete: if false;\n    }\n\n    match /classes/{classId}/settings/timetable {",
    "      allow delete: if signedIn() && reminderExpiredInKorea();\n    }\n\n    match /classes/{classId}/settings/timetable {",
    'todo delete rule',
)
p.write_text(t.rstrip() + '\n')

print('Reminder exact KST expiry and shared-delete path applied')
