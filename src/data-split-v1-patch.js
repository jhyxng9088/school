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

function patchSchoolSync(source) {
  const current = String(source || '')
  const sourceOwned = current.includes("import { publishClassLiveData } from './class-live-data.js'")
    && !current.includes('removeRevalidation = installServerRevalidation(refreshFromServer)')
    && current.includes("publishClassLiveData('todos', classKeyFor(profile), nextTodos)")
    && current.includes("publishClassLiveData('todoState', studentKeyFor(profile), nextState)")
    && countOccurrences(current, "publishClassLiveData('timetable', classKeyFor(profile), next)") >= 2
    && current.includes('const previous = weeklySchedule')
    && current.includes("publishClassLiveData('timetable', classKeyFor(profile), { weeklySchedule: normalized, overrides })")
    && current.includes('const previous = overrides')
    && current.includes("publishClassLiveData('timetable', classKeyFor(profile), { weeklySchedule, overrides: normalized })")
    && !current.includes('await refreshSharedTimetable()')
  if (sourceOwned) return current

  let next = current
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

export function patchDataSplitV1Source(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/school-sync.js')) return patchSchoolSync(source)
  return String(source || '')
}
