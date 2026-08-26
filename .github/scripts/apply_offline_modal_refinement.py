from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text.rstrip() + '\n')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 marker, found {count}')
    return text.replace(old, new, 1)


# 1) Unified sheet: remove legacy timetable header class from the shared mechanism.
p = 'src/unified-sheet.jsx'
t = read(p)
t = replace_once(
    t,
    'className="unified-sheet-head change-editor-head"',
    'className="unified-sheet-head"',
    'unified legacy head class',
)
write(p, t)

p = 'src/unified-sheet.css'
t = read(p)
t = t.replace(
    'body .unified-school-sheet .unified-sheet-head,\nbody .unified-school-sheet .change-editor-head {',
    'body .unified-school-sheet .unified-sheet-head {',
)
t = t.replace(
    'body .unified-school-sheet .unified-sheet-head::before,\nbody .unified-school-sheet .change-editor-head::before {',
    'body .unified-school-sheet .unified-sheet-head::before {',
)
marker = '.unified-sheet-scroll {\n'
if marker not in t:
    raise SystemExit('unified scroll marker missing')
isolation = '''body .unified-school-sheet .change-submit-row > button {
  position: static !important;
  inset: auto !important;
  transform: none !important;
}

'''
t = t.replace(marker, isolation + marker, 1)
write(p, t)

# 2) Shared Korean attribution helper + offline activity cache.
p = 'src/class-activity.js'
t = read(p)
t = replace_once(
    t,
    "export function activityLabel(value) {\n  if (!value?.actorName) return ''\n  return `${value.actorName}이 ${value.action === 'added' ? '추가함' : '수정함'}`\n}",
    """function subjectParticle(name) {
  const text = String(name || '').trim()
  if (!text) return '가'
  const code = text.charCodeAt(text.length - 1)
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 === 0 ? '가' : '이'
  return '가'
}

export function actorActionLabel(actorName, action = 'edited') {
  const name = String(actorName || '').trim()
  if (!name) return ''
  return `${name}${subjectParticle(name)} ${action === 'added' ? '추가함' : '수정함'}`
}

export function activityLabel(value) {
  if (!value?.actorName) return ''
  return actorActionLabel(value.actorName, value.action)
}""",
    'activity particle helper',
)

cache_marker = "const identityPromises = new Map()\n"
if cache_marker not in t:
    raise SystemExit('activity identity marker missing')
cache_code = """const ACTIVITY_CACHE_VERSION = 'v1'

function activityCacheKey(profile) {
  const normalized = currentProfile(profile)
  const classKey = normalized ? classKeyFor(normalized) : ''
  return classKey ? `school.classActivity.${ACTIVITY_CACHE_VERSION}.${classKey}` : ''
}

function readActivityCache(profile) {
  const key = activityCacheKey(profile)
  if (!key) return {}
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeActivityCache(profile, value) {
  const key = activityCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(value || {}))
  } catch {
    // Attribution cache only preserves the last rendered state while offline.
  }
}
"""
t = t.replace(cache_marker, cache_marker + cache_code, 1)
t = replace_once(t, 'const [activity, setActivity] = useState({})', 'const [activity, setActivity] = useState(() => readActivityCache(normalized))', 'activity cache state')
t = replace_once(
    t,
    "  useEffect(() => {\n    if (!signature) return undefined\n    let stopped = false",
    "  useEffect(() => {\n    if (!signature) return undefined\n    setActivity(readActivityCache(normalized))\n    let stopped = false",
    'activity effect cache restore',
)
t = replace_once(
    t,
    "    const applySnapshot = (snapshot) => {\n      if (stopped) return\n      generation += 1\n      const next = {}",
    "    const applySnapshot = (snapshot) => {\n      if (stopped || snapshot.metadata?.fromCache) return\n      generation += 1\n      const next = {}",
    'activity cache snapshot guard',
)
t = replace_once(
    t,
    '      setActivity(next)\n    }\n\n    const refreshFromServer',
    '      writeActivityCache(normalized, next)\n      setActivity(next)\n    }\n\n    const refreshFromServer',
    'activity cache write',
)
# The academic custom listener appears after the activity listener. Guard its cached Firestore snapshot too.
academic_apply = "    const applySnapshot = (snapshot) => {\n      if (stopped) return\n      generation += 1\n      const next = academicEventsFromSnapshot(snapshot)"
if academic_apply not in t:
    raise SystemExit('academic apply snapshot marker missing')
t = t.replace(
    academic_apply,
    "    const applySnapshot = (snapshot) => {\n      if (stopped || snapshot.metadata?.fromCache) return\n      generation += 1\n      const next = academicEventsFromSnapshot(snapshot)",
    1,
)
write(p, t)

# 3) Firestore cache-first behavior + future client reset generation infrastructure.
p = 'src/school-sync.js'
t = read(p)
t = replace_once(
    t,
    "export const STUDENT_PROFILE_KEY = 'school.studentProfile.v1'\nconst MIGRATION_VERSION = 'v1'",
    "export const STUDENT_PROFILE_KEY = 'school.studentProfile.v1'\nconst CLIENT_DATA_GENERATION_KEY = 'school.clientDataGeneration'\nconst CLIENT_DATA_GENERATION = '1'\nconst MIGRATION_VERSION = 'v1'",
    'client generation constants',
)
profile_marker = "export function saveStudentProfile(value) {\n  const profile = normalizeStudentProfile(value)\n  if (!profile) return null\n  localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(profile))\n  return profile\n}\n"
if profile_marker not in t:
    raise SystemExit('profile save marker missing')
generation_fn = """

export function prepareClientDataGeneration() {
  try {
    const stored = localStorage.getItem(CLIENT_DATA_GENERATION_KEY)
    if (!stored) {
      localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
      return false
    }
    if (stored === CLIENT_DATA_GENERATION) return false

    const installDone = localStorage.getItem('school.installGuideDone')
    Object.keys(localStorage)
      .filter((key) => key.startsWith('school.'))
      .forEach((key) => localStorage.removeItem(key))
    if (installDone !== null) localStorage.setItem('school.installGuideDone', installDone)
    localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
    return true
  } catch {
    return false
  }
}
"""
t = t.replace(profile_marker, profile_marker + generation_fn, 1)
# Ignore Firestore cache snapshots; our explicit localStorage snapshots are the offline first paint.
for label, old in [
    ('class todo snapshot', "  const applySnapshot = (snapshot) => {\n    if (stopped) return\n    generation += 1\n    onValue(sharedTodosFromSnapshot(snapshot))"),
    ('personal todo snapshot', "  const applySnapshot = (snapshot) => {\n    if (stopped) return\n    generation += 1\n    onValue(personalTodoStateFromSnapshot(snapshot))"),
]:
    if old not in t:
        raise SystemExit(f'{label} marker missing')
    t = t.replace(old, old.replace('if (stopped) return', 'if (stopped || snapshot.metadata?.fromCache) return'), 1)

timetable_old = "    const applySnapshot = (snapshot) => {\n      if (stopped) return\n      generation += 1\n      if (!snapshot.exists()) {"
if timetable_old not in t:
    raise SystemExit('timetable snapshot marker missing')
t = t.replace(
    timetable_old,
    "    const applySnapshot = (snapshot) => {\n      if (stopped || snapshot.metadata?.fromCache) return\n      generation += 1\n      if (!snapshot.exists()) {",
    1,
)
write(p, t)

# 4) Academic page: shared particle helper, offline write guard, no legacy sheet class.
p = 'src/academic-shared.jsx'
t = read(p)
import_marker = "import { UnifiedBottomSheet } from './unified-sheet.jsx'\n"
if import_marker not in t:
    raise SystemExit('academic unified import marker missing')
t = t.replace(import_marker, import_marker + "import { actorActionLabel } from './class-activity'\n", 1)
t = replace_once(
    t,
    "  return `${event.lastEditedByName}이 ${event.lastAction === 'added' ? '추가함' : '수정함'}`",
    "  return actorActionLabel(event.lastEditedByName, event.lastAction)",
    'academic attribution particle',
)
t = replace_once(
    t,
    'export function SharedAcademicPage({ now, schoolData, academicData }) {',
    'export function SharedAcademicPage({ now, schoolData, academicData, requireOnline = () => true }) {',
    'academic page signature',
)
t = replace_once(
    t,
    "  function openCreate() {\n    openSheet(emptyDraft(now))\n  }",
    "  function openCreate() {\n    if (!requireOnline('학사일정을 추가')) return\n    openSheet(emptyDraft(now))\n  }",
    'academic create guard',
)
t = replace_once(
    t,
    "  function openEdit(group) {\n    if (group.source !== 'custom') return\n    openSheet({",
    "  function openEdit(group) {\n    if (group.source !== 'custom') return\n    if (!requireOnline('학사일정을 수정')) return\n    openSheet({",
    'academic edit guard',
)
t = replace_once(
    t,
    "  async function save() {\n    if (!draft.title.trim() || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate || saving) return",
    "  async function save() {\n    if (!draft.title.trim() || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate || saving) return\n    if (!requireOnline(draft.id ? '학사일정을 수정' : '학사일정을 추가')) return",
    'academic save guard',
)
t = replace_once(
    t,
    "  async function remove() {\n    if (!draft.id || saving) return",
    "  async function remove() {\n    if (!draft.id || saving) return\n    if (!requireOnline('학사일정을 삭제')) return",
    'academic delete guard',
)
t = replace_once(t, 'className="change-editor academic-editor"', 'className="academic-editor"', 'academic legacy sheet class')
write(p, t)

# 5) Main shell: shared offline guard, timetable guards, no legacy sheet class, client generation bootstrap.
p = 'src/main.jsx'
t = read(p)
t = replace_once(
    t,
    "import { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'",
    "import { prepareClientDataGeneration, readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'",
    'main school sync import',
)
main_import_marker = "import { UnifiedBottomSheet } from './unified-sheet.jsx'\n"
if main_import_marker not in t:
    raise SystemExit('main unified import marker missing')
t = t.replace(main_import_marker, main_import_marker + "import { OfflineToast, useNetworkGuard } from './network-guard'\n", 1)
t = replace_once(
    t,
    'function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides, activity, profile }) {',
    'function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides, activity, profile, requireOnline = () => true }) {',
    'timetable signature',
)
t = replace_once(
    t,
    "  function startEditing() {\n    setDraft(cloneWeeklySchedule(weeklySchedule))",
    "  function startEditing() {\n    if (!requireOnline('시간표를 수정')) return\n    setDraft(cloneWeeklySchedule(weeklySchedule))",
    'timetable edit guard',
)
t = replace_once(
    t,
    "  async function saveBaseSchedule() {\n    const changedCells = WEEKDAYS.flatMap",
    "  async function saveBaseSchedule() {\n    if (!requireOnline('시간표를 수정')) return\n    const changedCells = WEEKDAYS.flatMap",
    'timetable base save guard',
)
t = replace_once(
    t,
    "  async function saveChange() {\n    if (!selectedDay || !selectedPeriodIsAvailable) return",
    "  async function saveChange() {\n    if (!selectedDay || !selectedPeriodIsAvailable) return\n    if (!requireOnline('시간표를 수정')) return",
    'timetable change save guard',
)
t = replace_once(
    t,
    "  async function removeChange(targetDate, period) {\n    const key = dateKey(targetDate)",
    "  async function removeChange(targetDate, period) {\n    if (!requireOnline('시간표를 수정')) return\n    const key = dateKey(targetDate)",
    'timetable remove guard',
)
t = replace_once(
    t,
    "  async function clearAllChanges() {\n    if (!Object.keys(overrides || {}).length) return",
    "  async function clearAllChanges() {\n    if (!Object.keys(overrides || {}).length) return\n    if (!requireOnline('시간표를 수정')) return",
    'timetable clear guard',
)
t = replace_once(
    t,
    "              onClick={() => setChangeOpen((value) => !value)}",
    "              onClick={() => { if (requireOnline('시간표를 수정')) setChangeOpen(true) }}",
    'timetable open change guard',
)
t = replace_once(t, 'className="change-editor timetable-unified-sheet"', 'className="timetable-unified-sheet"', 'timetable legacy sheet class')
# AppShell network hook + write guards.
t = replace_once(
    t,
    "function AppShell({ profile }) {\n  const [activeTab, setActiveTab] = useState('home')\n  const [contentDirection, setContentDirection] = useState(1)\n  const now = useNow()",
    "function AppShell({ profile }) {\n  const [activeTab, setActiveTab] = useState('home')\n  const [contentDirection, setContentDirection] = useState(1)\n  const { toast, requireOnline } = useNetworkGuard()\n  const now = useNow()",
    'network hook in shell',
)
t = replace_once(
    t,
    "  useEffect(() => {\n    const pruned = pruneExpiredOverrides(overrides, now)",
    "  useEffect(() => {\n    if (navigator.onLine === false) return\n    const pruned = pruneExpiredOverrides(overrides, now)",
    'offline prune guard',
)
t = replace_once(t, 'todo: <TodoPage now={now} todoData={todoData} />,', 'todo: <TodoPage now={now} todoData={todoData} requireOnline={requireOnline} />,', 'todo online prop')
t = replace_once(
    t,
    "        activity={activity}\n        profile={profile}\n      />",
    "        activity={activity}\n        profile={profile}\n        requireOnline={requireOnline}\n      />",
    'timetable online prop',
)
t = replace_once(
    t,
    'academic: <SharedAcademicPage now={now} schoolData={schoolData} academicData={academicData} />,',
    'academic: <SharedAcademicPage now={now} schoolData={schoolData} academicData={academicData} requireOnline={requireOnline} />,',
    'academic online prop',
)
nav_close = "      </nav>\n    </div>"
if nav_close not in t:
    raise SystemExit('nav close marker missing')
t = t.replace(nav_close, "      </nav>\n      <OfflineToast toast={toast} />\n    </div>", 1)
t = replace_once(
    t,
    '  const [profile, setProfile] = useState(readStudentProfile)',
    "  const [profile, setProfile] = useState(() => {\n    prepareClientDataGeneration()\n    return readStudentProfile()\n  })",
    'profile generation bootstrap',
)
t = t.replace('리마인더 완료와 삭제는 이 기기에만 저장돼.', '리마인더 완료와 삭제는 같은 학생의 기기끼리만 동기화돼.', 1)
write(p, t)

# Version bump happens only after all source changes are verified separately.

print('offline/modal refinement patch applied')
