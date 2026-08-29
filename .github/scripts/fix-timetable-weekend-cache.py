from pathlib import Path

# --- src/timetable.js: school-day/week helpers ---
timetable_path = Path('src/timetable.js')
timetable = timetable_path.read_text()
anchor = """export function getWeekDates(anchor = new Date()) {\n"""
insert = """export function getNextSchoolDate(anchor = new Date(), advance = false) {\n  const date = new Date(anchor)\n  date.setHours(12, 0, 0, 0)\n  if (advance) date.setDate(date.getDate() + 1)\n  while (date.getDay() === 0 || date.getDay() === 6) {\n    date.setDate(date.getDate() + 1)\n  }\n  return date\n}\n\nexport function getTimetableWeekAnchor(anchor = new Date()) {\n  return getNextSchoolDate(anchor, false)\n}\n\nexport function getWeekDates(anchor = new Date()) {\n"""
assert anchor in timetable, 'getWeekDates anchor changed'
timetable = timetable.replace(anchor, insert, 1)
timetable_path.write_text(timetable)

# --- src/main.jsx: show relevant week, choose next school day, polite modal copy ---
main_path = Path('src/main.jsx')
main = main_path.read_text()
anchor = """  getDayForDate,\n  getPeriodVisualState,\n  getPeriodsForDay,\n  getScheduleForDate,\n  getSchoolState,\n  getWeekDates,\n"""
replacement = """  getDayForDate,\n  getNextSchoolDate,\n  getPeriodVisualState,\n  getPeriodsForDay,\n  getScheduleForDate,\n  getSchoolState,\n  getTimetableWeekAnchor,\n  getWeekDates,\n"""
assert anchor in main, 'timetable import anchor changed'
main = main.replace(anchor, replacement, 1)

anchor = """  const [changePeriod, setChangePeriod] = useState(1)\n  const [changeSubject, setChangeSubject] = useState('')\n\n  const weekDates = useMemo(() => getWeekDates(now), [dateKey(now)])\n  const currentState = getSchoolState(now, weeklySchedule, displayOverrides)\n"""
replacement = """  const [changePeriod, setChangePeriod] = useState(1)\n  const [changeSubject, setChangeSubject] = useState('')\n  const [weekAnchor, setWeekAnchor] = useState(() => getTimetableWeekAnchor(now))\n\n  const weekDates = useMemo(() => getWeekDates(weekAnchor), [dateKey(weekAnchor)])\n  const currentState = getSchoolState(now, weeklySchedule, displayOverrides)\n\n  useEffect(() => {\n    setWeekAnchor(getTimetableWeekAnchor(now))\n  }, [dateKey(now)])\n"""
assert anchor in main, 'TimetablePage week anchor changed'
main = main.replace(anchor, replacement, 1)

anchor = """  function openChange(scope = 'shared') {\n    if (!requireOnline('시간표를 수정')) return\n    const initialDate = currentState.kind === 'done'\n      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0)\n      : now\n    setChangeScope(movingClass ? scope : 'shared')\n"""
replacement = """  function openChange(scope = 'shared') {\n    if (!requireOnline('시간표를 수정')) return\n    const initialDate = getNextSchoolDate(now, currentState.kind === 'done')\n    setChangeScope(movingClass ? scope : 'shared')\n"""
assert anchor in main, 'openChange anchor changed'
main = main.replace(anchor, replacement, 1)

anchor = """    if (!saved) return\n    if (!(movingClass && changeScope === 'personal')) recordClassActivities(profile, [{\n"""
replacement = """    if (!saved) return\n    setWeekAnchor(selectedDate)\n    if (!(movingClass && changeScope === 'personal')) recordClassActivities(profile, [{\n"""
assert anchor in main, 'saveChange completion anchor changed'
main = main.replace(anchor, replacement, 1)

old_copy = "기본 시간표는 그대로 두고 선택한 날짜에만 적용돼. 지나면 자동으로 기본 시간표로 돌아와."
new_copy = "기본 시간표는 그대로 두고 선택한 날짜에만 적용됩니다. 지나면 자동으로 기본 시간표로 돌아옵니다."
assert main.count(old_copy) == 1, 'temporary-change modal copy changed unexpectedly'
main = main.replace(old_copy, new_copy, 1)
main_path.write_text(main)

# --- src/school-sync.js: per-student cache + optimistic personal timetable paint ---
sync_path = Path('src/school-sync.js')
sync = sync_path.read_text()
anchor = """function movingClassEnabled(profile) {\n  const classNumber = Number(profile?.classNumber)\n  return Number.isInteger(classNumber) && classNumber >= 7 && classNumber <= 15\n}\n\nfunction mergeWeeklyTimetables(sharedSchedule, personalSchedule) {\n"""
replacement = """function movingClassEnabled(profile) {\n  const classNumber = Number(profile?.classNumber)\n  return Number.isInteger(classNumber) && classNumber >= 7 && classNumber <= 15\n}\n\nfunction personalTimetableCacheKey(profile, kind) {\n  const studentKey = studentKeyFor(profile)\n  return studentKey ? `school.timetable.personal.${kind}.v1.${studentKey}` : ''\n}\n\nfunction readPersonalTimetableCache(profile, kind) {\n  const key = personalTimetableCacheKey(profile, kind)\n  if (!key) return null\n  try {\n    return JSON.parse(localStorage.getItem(key) || 'null')\n  } catch {\n    return null\n  }\n}\n\nfunction loadPersonalWeeklyScheduleCache(profile) {\n  return normalizeWeeklySchedule(readPersonalTimetableCache(profile, 'weekly'))\n}\n\nfunction loadPersonalOverridesCache(profile, now = new Date()) {\n  return pruneExpiredOverrides(normalizeOverrides(readPersonalTimetableCache(profile, 'overrides')), now)\n}\n\nfunction savePersonalWeeklyScheduleCache(profile, schedule) {\n  const key = personalTimetableCacheKey(profile, 'weekly')\n  if (!key) return\n  try {\n    localStorage.setItem(key, JSON.stringify(normalizeWeeklySchedule(schedule)))\n  } catch {\n    // Server state remains authoritative when local storage is unavailable.\n  }\n}\n\nfunction savePersonalOverridesCache(profile, overrides) {\n  const key = personalTimetableCacheKey(profile, 'overrides')\n  if (!key) return\n  try {\n    localStorage.setItem(key, JSON.stringify(pruneExpiredOverrides(overrides || {})))\n  } catch {\n    // Server state remains authoritative when local storage is unavailable.\n  }\n}\n\nfunction mergeWeeklyTimetables(sharedSchedule, personalSchedule) {\n"""
assert anchor in sync, 'movingClassEnabled anchor changed'
sync = sync.replace(anchor, replacement, 1)

anchor = """export function useSharedTimetable(profile, now) {\n  const [weeklySchedule, setWeeklySchedule] = useState(() => loadWeeklySchedule())\n  const [overrides, setOverrides] = useState(() => pruneExpiredOverrides(loadOverrides(), now))\n  const [personalWeeklySchedule, setPersonalWeeklySchedule] = useState(() => normalizeWeeklySchedule(null))\n  const [personalOverrides, setPersonalOverrides] = useState({})\n  const signature = profileSignature(profile)\n  const movingClass = movingClassEnabled(profile)\n"""
replacement = """export function useSharedTimetable(profile, now) {\n  const signature = profileSignature(profile)\n  const movingClass = movingClassEnabled(profile)\n  const [weeklySchedule, setWeeklySchedule] = useState(() => loadWeeklySchedule())\n  const [overrides, setOverrides] = useState(() => pruneExpiredOverrides(loadOverrides(), now))\n  const [personalWeeklySchedule, setPersonalWeeklySchedule] = useState(() => movingClass\n    ? loadPersonalWeeklyScheduleCache(profile)\n    : normalizeWeeklySchedule(null))\n  const [personalOverrides, setPersonalOverrides] = useState(() => movingClass\n    ? loadPersonalOverridesCache(profile, now)\n    : {})\n"""
assert anchor in sync, 'useSharedTimetable initial state anchor changed'
sync = sync.replace(anchor, replacement, 1)

anchor = """      const data = await requestPersonalTimetable(profile, { action: 'load' })\n      setPersonalWeeklySchedule(normalizeWeeklySchedule(data?.weeklySchedule))\n      setPersonalOverrides(pruneExpiredOverrides(normalizeOverrides(data?.overrides), new Date()))\n      return true\n"""
replacement = """      const data = await requestPersonalTimetable(profile, { action: 'load' })\n      const nextWeekly = normalizeWeeklySchedule(data?.weeklySchedule)\n      const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data?.overrides), new Date())\n      savePersonalWeeklyScheduleCache(profile, nextWeekly)\n      savePersonalOverridesCache(profile, nextOverrides)\n      setPersonalWeeklySchedule(nextWeekly)\n      setPersonalOverrides(nextOverrides)\n      return true\n"""
assert anchor in sync, 'refreshPersonalTimetable anchor changed'
sync = sync.replace(anchor, replacement, 1)

anchor = """    let stopped = false\n    const refresh = async () => {\n      if (stopped) return\n      await refreshPersonalTimetable()\n    }\n    refresh()\n"""
replacement = """    setPersonalWeeklySchedule(loadPersonalWeeklyScheduleCache(profile))\n    setPersonalOverrides(loadPersonalOverridesCache(profile, new Date()))\n    let stopped = false\n    const refresh = async () => {\n      if (stopped) return\n      await refreshPersonalTimetable()\n    }\n    refresh()\n"""
assert anchor in sync, 'personal timetable effect anchor changed'
sync = sync.replace(anchor, replacement, 1)

anchor = """  const commitPersonalWeeklySchedule = useCallback(async (nextSchedule) => {\n    if (!movingClass) return false\n    const normalized = normalizeWeeklySchedule(nextSchedule)\n    try {\n      const data = await requestPersonalTimetable(profile, { action: 'saveWeekly', weeklySchedule: normalized })\n      setPersonalWeeklySchedule(normalizeWeeklySchedule(data?.weeklySchedule || normalized))\n      return true\n    } catch (error) {\n      console.error('Personal timetable save failed:', error)\n      return false\n    }\n  }, [signature, movingClass])\n"""
replacement = """  const commitPersonalWeeklySchedule = useCallback(async (nextSchedule) => {\n    if (!movingClass) return false\n    const normalized = normalizeWeeklySchedule(nextSchedule)\n    const previous = personalWeeklySchedule\n    savePersonalWeeklyScheduleCache(profile, normalized)\n    setPersonalWeeklySchedule(normalized)\n    try {\n      const data = await requestPersonalTimetable(profile, { action: 'saveWeekly', weeklySchedule: normalized })\n      const confirmed = normalizeWeeklySchedule(data?.weeklySchedule || normalized)\n      savePersonalWeeklyScheduleCache(profile, confirmed)\n      setPersonalWeeklySchedule(confirmed)\n      return true\n    } catch (error) {\n      savePersonalWeeklyScheduleCache(profile, previous)\n      setPersonalWeeklySchedule(previous)\n      console.error('Personal timetable save failed:', error)\n      return false\n    }\n  }, [signature, movingClass, personalWeeklySchedule])\n"""
assert anchor in sync, 'commitPersonalWeeklySchedule anchor changed'
sync = sync.replace(anchor, replacement, 1)

anchor = """  const commitPersonalOverrides = useCallback(async (nextOverrides) => {\n    if (!movingClass) return false\n    const normalized = pruneExpiredOverrides(nextOverrides, now)\n    try {\n      const data = await requestPersonalTimetable(profile, { action: 'saveOverrides', overrides: normalized })\n      setPersonalOverrides(pruneExpiredOverrides(normalizeOverrides(data?.overrides || normalized), now))\n      return true\n    } catch (error) {\n      console.error('Personal timetable override save failed:', error)\n      return false\n    }\n  }, [signature, movingClass, now])\n"""
replacement = """  const commitPersonalOverrides = useCallback(async (nextOverrides) => {\n    if (!movingClass) return false\n    const normalized = pruneExpiredOverrides(nextOverrides, now)\n    const previous = personalOverrides\n    savePersonalOverridesCache(profile, normalized)\n    setPersonalOverrides(normalized)\n    try {\n      const data = await requestPersonalTimetable(profile, { action: 'saveOverrides', overrides: normalized })\n      const confirmed = pruneExpiredOverrides(normalizeOverrides(data?.overrides || normalized), now)\n      savePersonalOverridesCache(profile, confirmed)\n      setPersonalOverrides(confirmed)\n      return true\n    } catch (error) {\n      savePersonalOverridesCache(profile, previous)\n      setPersonalOverrides(previous)\n      console.error('Personal timetable override save failed:', error)\n      return false\n    }\n  }, [signature, movingClass, now, personalOverrides])\n"""
assert anchor in sync, 'commitPersonalOverrides anchor changed'
sync = sync.replace(anchor, replacement, 1)
sync_path.write_text(sync)

# --- regression tests ---
test_path = Path('tests/timetable-weekend-regression.test.js')
test_path.write_text("""import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\nimport {\n  dateKey,\n  getNextSchoolDate,\n  getTimetableWeekAnchor,\n  getWeekDates,\n} from '../src/timetable.js'\n\ntest('weekend timetable opens the next school week', () => {\n  const saturday = new Date(2026, 7, 29, 12, 0, 0)\n  const sunday = new Date(2026, 7, 30, 12, 0, 0)\n  assert.equal(dateKey(getTimetableWeekAnchor(saturday)), '2026-08-31')\n  assert.equal(dateKey(getTimetableWeekAnchor(sunday)), '2026-08-31')\n  assert.deepEqual(\n    getWeekDates(getTimetableWeekAnchor(saturday)).map(dateKey),\n    ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],\n  )\n})\n\ntest('temporary change defaults to the next real school day after classes finish', () => {\n  const fridayAfterClass = new Date(2026, 7, 28, 17, 30, 0)\n  assert.equal(dateKey(getNextSchoolDate(fridayAfterClass, true)), '2026-08-31')\n\n  const wednesday = new Date(2026, 7, 26, 12, 0, 0)\n  assert.equal(dateKey(getNextSchoolDate(wednesday, false)), '2026-08-26')\n  assert.equal(dateKey(getNextSchoolDate(wednesday, true)), '2026-08-27')\n})\n\ntest('timetable page follows the date that was temporarily changed and uses polite modal copy', () => {\n  const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')\n  assert.match(main, /setWeekAnchor\\(selectedDate\\)/)\n  assert.match(main, /getNextSchoolDate\\(now, currentState\\.kind === 'done'\\)/)\n  assert.ok(main.includes('기본 시간표는 그대로 두고 선택한 날짜에만 적용됩니다. 지나면 자동으로 기본 시간표로 돌아옵니다.'))\n  assert.ok(!main.includes('기본 시간표로 돌아와.'))\n})\n\ntest('personal timetable cache is student-scoped and paints before its save request finishes', () => {\n  const sync = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')\n  assert.match(sync, /personalTimetableCacheKey\\(profile, kind\\)/)\n  assert.match(sync, /studentKeyFor\\(profile\\)/)\n  assert.match(sync, /loadPersonalWeeklyScheduleCache\\(profile\\)/)\n  assert.match(sync, /loadPersonalOverridesCache\\(profile, now\\)/)\n\n  const weeklyBlock = sync.slice(\n    sync.indexOf('const commitPersonalWeeklySchedule'),\n    sync.indexOf('const commitPersonalOverrides'),\n  )\n  assert.ok(weeklyBlock.indexOf('setPersonalWeeklySchedule(normalized)') < weeklyBlock.indexOf("requestPersonalTimetable(profile, { action: 'saveWeekly'"))\n\n  const overrideBlock = sync.slice(sync.indexOf('const commitPersonalOverrides'))\n  assert.ok(overrideBlock.indexOf('setPersonalOverrides(normalized)') < overrideBlock.indexOf("requestPersonalTimetable(profile, { action: 'saveOverrides'"))\n})\n""")
