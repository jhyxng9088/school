function countOccurrences(source, marker) {
  if (!marker) return 0
  return String(source || '').split(marker).length - 1
}

function replaceExact(source, marker, replacement, expectedCount = 1) {
  const count = countOccurrences(source, marker)
  if (count !== expectedCount) {
    throw new Error(`S-Hub data-split patch drift: expected ${expectedCount} occurrence(s), found ${count}: ${marker.slice(0, 90)}`)
  }
  return source.split(marker).join(replacement)
}

function replaceBetween(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`S-Hub data-split patch drift: start marker missing: ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  if (end < 0) throw new Error(`S-Hub data-split patch drift: end marker missing: ${endMarker}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function patchSchoolSync(source) {
  let next = String(source || '')
  next = replaceExact(
    next,
    "import { isReminderTypeId, normalizeReminderCategory, normalizeReminderCategories } from './reminder-categories.js'",
    "import { isReminderTypeId, normalizeReminderCategory, normalizeReminderCategories } from './reminder-categories.js'\nimport { publishClassLiveData } from './class-live-data.js'",
  )

  // onSnapshot already performs the authoritative server sync. Re-fetching the same
  // collections on every focus/online event only burns Firestore reads.
  next = replaceExact(
    next,
    'removeRevalidation = installServerRevalidation(refreshFromServer)',
    'removeRevalidation = () => {}',
    4,
  )
  next = replaceExact(
    next,
    '        removeRevalidation = () => {}\n        refreshFromServer()\n',
    '        removeRevalidation = () => {}\n',
  )

  next = replaceExact(
    next,
    '    onValue(sharedTodosFromSnapshot(snapshot))',
    "    const nextTodos = sharedTodosFromSnapshot(snapshot)\n    publishClassLiveData('todos', classKeyFor(profile), nextTodos)\n    onValue(nextTodos)",
  )
  next = replaceExact(
    next,
    '    onValue(personalTodoStateFromSnapshot(snapshot))',
    "    const nextState = personalTodoStateFromSnapshot(snapshot)\n    publishClassLiveData('todoState', studentKeyFor(profile), nextState)\n    onValue(nextState)",
  )

  const timetableApply = [
    '      saveWeeklySchedule(next.weeklySchedule)',
    '      saveOverrides(next.overrides)',
    '      setWeeklySchedule(next.weeklySchedule)',
    '      setOverrides(next.overrides)',
  ].join('\n')
  next = replaceExact(
    next,
    timetableApply,
    `${timetableApply}\n      publishClassLiveData('timetable', classKeyFor(profile), next)`,
    2,
  )

  const oldWeeklyCommit = `  const commitWeeklySchedule = useCallback(async (nextSchedule) => {
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
  }, [signature])`
  const newWeeklyCommit = `  const commitWeeklySchedule = useCallback(async (nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    const previous = weeklySchedule
    saveWeeklySchedule(normalized)
    setWeeklySchedule(normalized)
    publishClassLiveData('timetable', classKeyFor(profile), { weeklySchedule: normalized, overrides })
    try {
      await writeWeeklyScheduleCloud(profile, normalized)
      return true
    } catch (error) {
      saveWeeklySchedule(previous)
      setWeeklySchedule(previous)
      publishClassLiveData('timetable', classKeyFor(profile), { weeklySchedule: previous, overrides })
      console.error('Shared timetable save failed:', error)
      return false
    }
  }, [signature, weeklySchedule, overrides])`
  next = replaceExact(next, oldWeeklyCommit, newWeeklyCommit)

  const oldOverrideCommit = `  const commitOverrides = useCallback(async (nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    try {
      await writeOverridesCloud(profile, normalized)
      saveOverrides(normalized)
      setOverrides(normalized)
      await refreshSharedTimetable()
      return true
    } catch (error) {
      console.error('Shared timetable override save failed:', error)
      return false
    }
  }, [signature, now])`
  const newOverrideCommit = `  const commitOverrides = useCallback(async (nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    const previous = overrides
    saveOverrides(normalized)
    setOverrides(normalized)
    publishClassLiveData('timetable', classKeyFor(profile), { weeklySchedule, overrides: normalized })
    try {
      await writeOverridesCloud(profile, normalized)
      return true
    } catch (error) {
      saveOverrides(previous)
      setOverrides(previous)
      publishClassLiveData('timetable', classKeyFor(profile), { weeklySchedule, overrides: previous })
      console.error('Shared timetable override save failed:', error)
      return false
    }
  }, [signature, now, overrides, weeklySchedule])`
  next = replaceExact(next, oldOverrideCommit, newOverrideCommit)

  return next
}

function patchClassActivity(source) {
  let next = String(source || '')
  next = replaceExact(
    next,
    "} from './school-sync'\n\nconst syncApp",
    "} from './school-sync'\nimport { publishClassLiveData } from './class-live-data.js'\n\nconst syncApp",
  )
  next = replaceExact(
    next,
    'removeRevalidation = installServerRevalidation(refreshFromServer)',
    'removeRevalidation = () => {}',
    2,
  )
  next = replaceExact(
    next,
    '      writeActivityCache(normalized, next)\n      setActivity(next)',
    "      writeActivityCache(normalized, next)\n      publishClassLiveData('activity', classKeyFor(normalized), next)\n      setActivity(next)",
  )
  next = replaceExact(
    next,
    '      writeAcademicCache(normalized, next)\n      setEvents(next)',
    "      writeAcademicCache(normalized, next)\n      publishClassLiveData('academic', classKeyFor(normalized), next)\n      setEvents(next)",
  )
  return next
}

function patchMain(source) {
  return replaceExact(
    String(source || ''),
    `  useEffect(() => {
    if (!timetableActivityRevision || navigator.onLine === false) return
    refreshSharedTimetable()
  }, [timetableActivityRevision, refreshSharedTimetable])

`,
    '',
  )
}

function patchAcademicCleanup(source) {
  const next = String(source || '')
  return replaceBetween(
    next,
    'export async function cleanupExpiredCustomAcademicEvents',
    '\nfunction scheduleNextMidnight()',
    `export async function cleanupExpiredCustomAcademicEvents() {
  // The academic UI already excludes finished custom events. Client-by-client full
  // collection scans are disabled; physical cleanup will be centralized server-side.
  return true
}
`,
  )
}

function unreadBusSubscriptions() {
  return `  subscriptions.push(subscribeClassLiveData('activity', classId, (activity) => {
    const next = new Map()
    Object.values(activity || {}).forEach((value) => {
      if (!value?.entityType || !value?.entityId) return
      next.set(\`${'${value.entityType}:${value.entityId}'}\`, {
        entityType: String(value.entityType),
        entityId: String(value.entityId),
        actorStudentKey: String(value.actorStudentKey || ''),
        action: value.action === 'added' ? 'added' : 'edited',
        updatedAt: Number(value.updatedAt || 0),
      })
    })
    state.activity = next
    state.activityReady = true
    scheduleRender()
  }))

  subscriptions.push(subscribeClassLiveData('timetable', classId, (timetable) => {
    const rawOverrides = timetable?.overrides
    const nextOverrides = {}
    const today = todayDateKey()
    if (rawOverrides && typeof rawOverrides === 'object') {
      Object.entries(rawOverrides).forEach(([date, periods]) => {
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || date < today || !periods || typeof periods !== 'object') return
        const nextPeriods = {}
        Object.entries(periods).forEach(([period, subject]) => {
          const number = Number(period)
          const cleanSubject = String(subject || '').trim()
          if (!Number.isInteger(number) || number < 1 || number > 7 || !cleanSubject) return
          nextPeriods[String(number)] = cleanSubject
        })
        if (Object.keys(nextPeriods).length) nextOverrides[date] = nextPeriods
      })
    }
    state.timetableOverrides = nextOverrides
    state.timetableReady = true
    scheduleRender()
  }))

  subscriptions.push(subscribeClassLiveData('todos', classId, (todos) => {
    const next = new Map()
    ;(Array.isArray(todos) ? todos : []).forEach((value) => {
      if (!value?.id) return
      next.set(String(value.id), {
        id: String(value.id),
        dueDate: String(value.dueDate || ''),
        dueTime: String(value.dueTime || ''),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
      })
    })
    state.todos = next
    state.todosReady = true
    scheduleRender()
  }))

  subscriptions.push(subscribeClassLiveData('academic', classId, (events) => {
    const next = new Map()
    ;(Array.isArray(events) ? events : []).forEach((value) => {
      if (!value?.id) return
      next.set(String(value.id), {
        startDate: String(value.startDate || ''),
        endDate: String(value.endDate || value.startDate || ''),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
        lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),
      })
    })
    state.academic = next
    state.academicReady = true
    scheduleRender()
  }))

  subscriptions.push(subscribeClassLiveData('todoState', studentKey, (todoState) => {
    const nextSeen = new Map()
    const nextTodoState = new Map()
    Object.entries(todoState || {}).forEach(([id, value]) => {
      if (id.startsWith(INTERNAL_PREFIX)) {
        nextSeen.set(id, { updatedAt: Number(value?.updatedAt || 0) })
        return
      }
      nextTodoState.set(id, {
        completed: Boolean(value?.completed),
        hidden: Boolean(value?.hidden),
        updatedAt: Number(value?.updatedAt || 0),
      })
    })
    pendingWrites.forEach((version, id) => {
      if (Number(version || 0) > Number(nextSeen.get(id)?.updatedAt || 0)) {
        nextSeen.set(id, { updatedAt: Number(version || 0) })
      }
    })
    state.seen = nextSeen
    state.todoState = nextTodoState
    state.seenReady = true
    scheduleRender()
  }))
`
}

function patchUnreadIndicators(source) {
  let next = String(source || '')
  next = replaceExact(
    next,
    "import { classKeyFor, ensureSignedIn, readStudentProfile, studentKeyFor } from './school-sync'",
    "import { classKeyFor, ensureSignedIn, readStudentProfile, studentKeyFor } from './school-sync'\nimport { subscribeClassLiveData } from './class-live-data.js'",
  )
  next = replaceBetween(
    next,
    "  subscriptions.push(onSnapshot(collection(db, 'classes', classId, 'activity')",
    "\n  document.addEventListener('click', handleClick, true)",
    unreadBusSubscriptions(),
  )
  return next
}

export function patchDataSplitV1Source(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/school-sync.js')) return patchSchoolSync(source)
  if (cleanId.endsWith('/src/class-activity.js')) return patchClassActivity(source)
  if (cleanId.endsWith('/src/main.jsx')) return patchMain(source)
  if (cleanId.endsWith('/src/academic-expiry-cleanup.js')) return patchAcademicCleanup(source)
  if (cleanId.endsWith('/src/unread-indicators-v2.js')) return patchUnreadIndicators(source)
  return String(source || '')
}
