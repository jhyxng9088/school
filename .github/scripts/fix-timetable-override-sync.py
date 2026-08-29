from pathlib import Path

sync_path = Path('src/school-sync.js')
sync = sync_path.read_text()

anchor = """async function writeOverridesCloud(profile, overrides) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    overrides: pruneExpiredOverrides(overrides || {}),
    updatedAt: Date.now(),
  }, { mergeFields: ['overrides', 'updatedAt'] })
}

export function useSharedTimetable(profile, now) {
"""
replacement = """async function writeOverridesCloud(profile, overrides) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    overrides: pruneExpiredOverrides(overrides || {}),
    updatedAt: Date.now(),
  }, { mergeFields: ['overrides', 'updatedAt'] })
}

function timetableStateFromSnapshot(snapshot, now = new Date()) {
  if (!snapshot.exists()) {
    return { weeklySchedule: normalizeWeeklySchedule(null), overrides: {} }
  }
  const data = snapshot.data() || {}
  return {
    weeklySchedule: normalizeWeeklySchedule(data.weeklySchedule),
    overrides: pruneExpiredOverrides(normalizeOverrides(data.overrides), now),
  }
}

export function useSharedTimetable(profile, now) {
"""
assert anchor in sync, 'shared timetable anchor changed'
sync = sync.replace(anchor, replacement, 1)

anchor = """  const signature = profileSignature(profile)
  const movingClass = movingClassEnabled(profile)

  useEffect(() => {
"""
replacement = """  const signature = profileSignature(profile)
  const movingClass = movingClassEnabled(profile)

  const refreshSharedTimetable = useCallback(async () => {
    if (!signature) return false
    try {
      await ensureSignedIn()
      const snapshot = await getDocFromServer(timetableRef(profile))
      const next = timetableStateFromSnapshot(snapshot, new Date())
      saveWeeklySchedule(next.weeklySchedule)
      saveOverrides(next.overrides)
      setWeeklySchedule(next.weeklySchedule)
      setOverrides(next.overrides)
      return true
    } catch (error) {
      console.error('Timetable server refresh failed:', error)
      return false
    }
  }, [signature])

  const refreshPersonalTimetable = useCallback(async () => {
    if (!signature || !movingClass) return false
    try {
      const data = await requestPersonalTimetable(profile, { action: 'load' })
      setPersonalWeeklySchedule(normalizeWeeklySchedule(data?.weeklySchedule))
      setPersonalOverrides(pruneExpiredOverrides(normalizeOverrides(data?.overrides), new Date()))
      return true
    } catch (error) {
      console.error('Personal timetable server refresh failed:', error)
      return false
    }
  }, [signature, movingClass])

  useEffect(() => {
"""
assert anchor in sync, 'hook state anchor changed'
sync = sync.replace(anchor, replacement, 1)

old = """    const applySnapshot = (snapshot) => {
      if (stopped || snapshot.metadata?.fromCache) return
      generation += 1
      if (!snapshot.exists()) {
        const nextWeekly = normalizeWeeklySchedule(null)
        const nextOverrides = {}
        saveWeeklySchedule(nextWeekly)
        saveOverrides(nextOverrides)
        setWeeklySchedule(nextWeekly)
        setOverrides(nextOverrides)
        return
      }

      const data = snapshot.data() || {}
      const nextWeekly = normalizeWeeklySchedule(data.weeklySchedule)
      const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data.overrides), new Date())
      saveWeeklySchedule(nextWeekly)
      saveOverrides(nextOverrides)
      setWeeklySchedule(nextWeekly)
      setOverrides(nextOverrides)
    }
"""
new = """    const applySnapshot = (snapshot) => {
      if (stopped) return
      generation += 1
      const next = timetableStateFromSnapshot(snapshot, new Date())
      saveWeeklySchedule(next.weeklySchedule)
      saveOverrides(next.overrides)
      setWeeklySchedule(next.weeklySchedule)
      setOverrides(next.overrides)
    }
"""
assert old in sync, 'snapshot block changed'
sync = sync.replace(old, new, 1)

old = """        removeRevalidation = installServerRevalidation(refreshFromServer)
        })
"""
new = """        removeRevalidation = installServerRevalidation(refreshFromServer)
        refreshFromServer()
        })
"""
assert old in sync, 'shared listener setup changed'
sync = sync.replace(old, new, 1)

old = """    let stopped = false
    const refresh = async () => {
      try {
        const data = await requestPersonalTimetable(profile, { action: 'load' })
        if (stopped) return
        setPersonalWeeklySchedule(normalizeWeeklySchedule(data?.weeklySchedule))
        setPersonalOverrides(pruneExpiredOverrides(normalizeOverrides(data?.overrides), new Date()))
      } catch (error) {
        if (!stopped) console.error('Personal timetable load failed:', error)
      }
    }
    refresh()
    const removeRevalidation = installServerRevalidation(refresh)
    return () => {
      stopped = true
      removeRevalidation()
    }
  }, [signature, movingClass])
"""
new = """    let stopped = false
    const refresh = async () => {
      if (stopped) return
      await refreshPersonalTimetable()
    }
    refresh()
    const removeRevalidation = installServerRevalidation(refresh)
    return () => {
      stopped = true
      removeRevalidation()
    }
  }, [signature, movingClass, refreshPersonalTimetable])
"""
assert old in sync, 'personal refresh effect changed'
sync = sync.replace(old, new, 1)

old = """      await writeOverridesCloud(profile, normalized)
      saveOverrides(normalized)
      setOverrides(normalized)
      return true
"""
new = """      await writeOverridesCloud(profile, normalized)
      saveOverrides(normalized)
      setOverrides(normalized)
      await refreshSharedTimetable()
      return true
"""
assert old in sync, 'shared override commit changed'
sync = sync.replace(old, new, 1)

old = """      await requestPersonalTimetable(profile, { action: 'saveWeekly', weeklySchedule: normalized })
      setPersonalWeeklySchedule(normalized)
      return true
"""
new = """      const data = await requestPersonalTimetable(profile, { action: 'saveWeekly', weeklySchedule: normalized })
      setPersonalWeeklySchedule(normalizeWeeklySchedule(data?.weeklySchedule || normalized))
      return true
"""
assert old in sync, 'personal weekly commit changed'
sync = sync.replace(old, new, 1)

old = """      await requestPersonalTimetable(profile, { action: 'saveOverrides', overrides: normalized })
      setPersonalOverrides(normalized)
      return true
"""
new = """      const data = await requestPersonalTimetable(profile, { action: 'saveOverrides', overrides: normalized })
      setPersonalOverrides(pruneExpiredOverrides(normalizeOverrides(data?.overrides || normalized), now))
      return true
"""
assert old in sync, 'personal override commit changed'
sync = sync.replace(old, new, 1)

old = """    commitPersonalWeeklySchedule,
    commitPersonalOverrides,
  }
}
"""
new = """    commitPersonalWeeklySchedule,
    commitPersonalOverrides,
    refreshSharedTimetable,
    refreshPersonalTimetable,
  }
}
"""
assert old in sync, 'return block changed'
sync = sync.replace(old, new, 1)
sync_path.write_text(sync)

main_path = Path('src/main.jsx')
main = main_path.read_text()

anchor = """function cloneWeeklySchedule(schedule) {
  return JSON.parse(JSON.stringify(schedule))
}

function formatWeekRange(weekDates) {
"""
replacement = """function cloneWeeklySchedule(schedule) {
  return JSON.parse(JSON.stringify(schedule))
}

function mergeVisibleTimetableOverrides(sharedOverrides, personalOverrides, now) {
  const shared = pruneExpiredOverrides(sharedOverrides || {}, now)
  const personal = pruneExpiredOverrides(personalOverrides || {}, now)
  const merged = { ...shared }
  for (const [date, periods] of Object.entries(personal)) {
    merged[date] = { ...(merged[date] || {}), ...periods }
  }
  return merged
}

function formatWeekRange(weekDates) {
"""
assert anchor in main, 'main helper anchor changed'
main = main.replace(anchor, replacement, 1)

old = """  const movingClass = Number(profile?.classNumber) >= 7 && Number(profile?.classNumber) <= 15
  const [editing, setEditing] = useState(false)
"""
new = """  const movingClass = Number(profile?.classNumber) >= 7 && Number(profile?.classNumber) <= 15
  const displayOverrides = movingClass
    ? mergeVisibleTimetableOverrides(sharedOverrides, personalOverrides, now)
    : overrides
  const [editing, setEditing] = useState(false)
"""
assert old in main, 'TimetablePage moving class anchor changed'
main = main.replace(old, new, 1)
main = main.replace('const currentState = getSchoolState(now, weeklySchedule, overrides)', 'const currentState = getSchoolState(now, weeklySchedule, displayOverrides)', 1)
main = main.replace('getScheduleForDate(date, weeklySchedule, overrides)\n      .filter((period) => period.isOverride)', 'getScheduleForDate(date, weeklySchedule, displayOverrides)\n      .filter((period) => period.isOverride)', 1)
main = main.replace('const daySchedule = getScheduleForDate(date, weeklySchedule, overrides)', 'const daySchedule = getScheduleForDate(date, weeklySchedule, displayOverrides)', 1)

old = """              <button className=\"timetable-action\" onClick={() => startEditing('shared')}><span>공동 기본</span><small>시간표 변경</small></button>
              <button className=\"timetable-action primary\" onClick={() => openChange('shared')}><span>공동</span><small>시간표 변경</small></button>
              <button className=\"timetable-action\" onClick={() => startEditing('personal')}><span>개인 기본</span><small>시간표 변경</small></button>
              <button className=\"timetable-action primary\" onClick={() => openChange('personal')}><span>개인</span><small>시간표 변경</small></button>
"""
new = """              <button className=\"timetable-action\" onClick={() => startEditing('shared')}><span>공동 기본</span><small>주간표 수정</small></button>
              <button className=\"timetable-action primary\" onClick={() => openChange('shared')}><span>공동 임시</span><small>날짜별 변경</small></button>
              <button className=\"timetable-action\" onClick={() => startEditing('personal')}><span>개인 기본</span><small>주간표 수정</small></button>
              <button className=\"timetable-action primary\" onClick={() => openChange('personal')}><span>개인 임시</span><small>날짜별 변경</small></button>
"""
assert old in main, 'moving timetable button labels changed'
main = main.replace(old, new, 1)
main = main.replace("title={movingClass ? `${changeScope === 'personal' ? '개인' : '공동'} 시간표 변경` : '변경 시간표 추가'}", "title={movingClass ? `${changeScope === 'personal' ? '개인' : '공동'} 임시 시간표 변경` : '변경 시간표 추가'}", 1)
main = main.replace("ariaLabel={movingClass ? `${changeScope === 'personal' ? '개인' : '공동'} 시간표 변경` : '변경 시간표 추가'}", "ariaLabel={movingClass ? `${changeScope === 'personal' ? '개인' : '공동'} 임시 시간표 변경` : '변경 시간표 추가'}", 1)

old = """    commitPersonalWeeklySchedule,
    commitPersonalOverrides,
  } = useSharedTimetable(profile, now)
"""
new = """    commitPersonalWeeklySchedule,
    commitPersonalOverrides,
    refreshSharedTimetable,
  } = useSharedTimetable(profile, now)
"""
assert old in main, 'AppShell timetable destructure changed'
main = main.replace(old, new, 1)

old = """  const activity = useClassActivity(profile)
  const name = profile.name
"""
new = """  const activity = useClassActivity(profile)
  const timetableActivityRevision = useMemo(() => Object.values(activity || {}).reduce((latest, item) => (
    item?.entityType === 'timetable' ? Math.max(latest, Number(item.updatedAt || 0)) : latest
  ), 0), [activity])
  const name = profile.name
"""
assert old in main, 'activity anchor changed'
main = main.replace(old, new, 1)

old = """  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  const aiContext = useMemo(() => {
"""
new = """  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  useEffect(() => {
    if (!timetableActivityRevision || navigator.onLine === false) return
    refreshSharedTimetable()
  }, [timetableActivityRevision, refreshSharedTimetable])

  const aiContext = useMemo(() => {
"""
assert old in main, 'nav/AI anchor changed'
main = main.replace(old, new, 1)
main_path.write_text(main)
