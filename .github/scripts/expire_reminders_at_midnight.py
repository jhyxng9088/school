from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 marker, found {count}')
    return text.replace(old, new, 1)

p = Path('src/todo.jsx')
t = p.read_text()

parse_marker = "function parseDue(todo) {\n  const time = todo.dueTime || '23:59'\n  return new Date(`${todo.dueDate}T${time}:00`)\n}\n"
if parse_marker not in t:
    raise SystemExit('parseDue marker missing')
expiry_helpers = """

function todoExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate)) return Number.POSITIVE_INFINITY
  const endOfDueDate = Date.parse(`${dueDate}T23:59:59.999+09:00`)
  return Number.isFinite(endOfDueDate) ? endOfDueDate + 1 : Number.POSITIVE_INFINITY
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
state_new = "  const [remoteReady, setRemoteReady] = useState(false)\n  const [expiryClock, setExpiryClock] = useState(() => Date.now())\n  const firstRemoteReadyRef = useRef(false)"
t = replace_once(t, state_old, state_new, 'expiry clock state')

calc_old = "  const mergedTodos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])\n  const todos = remoteReady ? mergedTodos : bootTodos\n"
calc_new = "  const mergedTodos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])\n  const sourceTodos = remoteReady ? mergedTodos : bootTodos\n  const todos = useMemo(() => visibleUnexpiredTodos(sourceTodos, expiryClock), [sourceTodos, expiryClock])\n"
t = replace_once(t, calc_old, calc_new, 'visible expiry filter')

effect_marker = "  useEffect(() => {\n    writeVisibleTodosCache(profile, todos)\n  }, [signature, todos])\n"
if effect_marker not in t:
    raise SystemExit('visible cache effect marker missing')
expiry_effect = """

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
"""
t = t.replace(effect_marker, effect_marker + expiry_effect, 1)

# Prevent expired shared snapshots from reappearing in the first-paint visible cache.
first_pair_old = "      const nextVisible = mergeSharedTodos(nextShared, nextPersonal)\n      writeVisibleTodosCache(profile, nextVisible)"
first_pair_new = "      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(nextShared, nextPersonal))\n      writeVisibleTodosCache(profile, nextVisible)"
t = replace_once(t, first_pair_old, first_pair_new, 'first remote expiry cache')

# There are two local personal-state cache writes using mergeSharedTodos; filter both.
t = t.replace(
    "      const nextVisible = mergeSharedTodos(sharedTodos, next)\n      writeVisibleTodosCache(profile, nextVisible)",
    "      const nextVisible = visibleUnexpiredTodos(mergeSharedTodos(sharedTodos, next))\n      writeVisibleTodosCache(profile, nextVisible)",
)

p.write_text(t.rstrip() + '\n')
print('Reminder midnight expiry filtering applied')
