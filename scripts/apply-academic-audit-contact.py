from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    file.write_text(text.replace(old, new, 1))


def insert_before(path, marker, addition, label):
    replace_once(path, marker, addition + marker, label)

# main.jsx imports and contact notice
replace_once('src/main.jsx', "import './todo.css'\n", "import './todo.css'\nimport './audit-academic.css'\n", 'main css import')
replace_once('src/main.jsx', "  AcademicPage,\n  AcademicPreview,\n", "  AcademicPreview,\n", 'remove old academic page import')
replace_once('src/main.jsx', "} from './stage3'\n", "} from './stage3'\nimport AcademicPage from './academic-page'\n", 'new academic page import')
replace_once(
    'src/main.jsx',
    "import { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'",
    "import { readStudentProfile, saveStudentProfile, useClassPresence, useSharedAcademicEvents, useSharedTimetable } from './school-sync'",
    'school sync import',
)
replace_once(
    'src/main.jsx',
    "const USER_NAME_KEY = 'school.userName'\n",
    "const USER_NAME_KEY = 'school.userName'\nconst CONTACT_NOTICE_KEY = 'school.contactNoticeDone.v1'\nconst INSTAGRAM_CONTACT_URL = 'https://www.instagram.com/j.hyxng?igsi=eW9rczVqczBnMnBz&utm_source=qr'\n",
    'contact constants',
)
insert_before(
    'src/main.jsx',
    'const tabs = [',
    '''function ContactNotice({ onConfirm }) {
  return (
    <main className="onboarding-page">
      <section className="onboarding-card contact-notice-card">
        <p className="eyebrow">School</p>
        <h1>수정사항이나 문의사항이 있으면 알려줘</h1>
        <p className="onboarding-copy">앱을 쓰다가 고칠 점이나 문의할 내용이 생기면 아래 인스타그램으로 연락해.</p>
        <a className="contact-notice-link" href={INSTAGRAM_CONTACT_URL} target="_blank" rel="noreferrer">@j.hyxng</a>
        <button className="primary-button" type="button" onClick={onConfirm}>확인</button>
      </section>
    </main>
  )
}

''',
    'contact notice component',
)
insert_before(
    'src/main.jsx',
    'function TimetablePage(',
    '''function attributionLabel(audit) {
  if (!audit?.name) return ''
  return `${audit.name}이 ${audit.action === 'modified' ? '수정함' : '추가함'}`
}

''',
    'attribution label',
)
replace_once(
    'src/main.jsx',
    'function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides }) {',
    'function TimetablePage({ now, weeklySchedule, overrides, weeklyMeta, overrideMeta, onSaveWeekly, onSaveOverrides }) {',
    'timetable props',
)
replace_once(
    'src/main.jsx',
    '''      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        ...period,
      })),''',
    '''      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        audit: overrideMeta?.[dateKey(date)]?.[period.number] || null,
        ...period,
      })),''',
    'week change audit',
)
replace_once(
    'src/main.jsx',
    '''                return (
                  <div className={classes} key={`${day.id}-${period.number}`}>
                    {item?.isOverride ? <span className="change-dot" aria-label="변경 시간표" /> : null}
                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                  </div>
                )''',
    '''                const cellAudit = item?.isOverride
                  ? overrideMeta?.[dateKey(date)]?.[period.number]
                  : weeklyMeta?.[day.id]?.[period.number]

                return (
                  <div className={classes} key={`${day.id}-${period.number}`}>
                    {item?.isOverride ? <span className="change-dot" aria-label="변경 시간표" /> : null}
                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                    {attributionLabel(cellAudit) ? <small className="cell-attribution">{attributionLabel(cellAudit)}</small> : null}
                  </div>
                )''',
    'timetable cell audit',
)
replace_once(
    'src/main.jsx',
    '''                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                </div>''',
    '''                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                  {attributionLabel(change.audit) ? <small className="change-attribution">{attributionLabel(change.audit)}</small> : null}
                </div>''',
    'week change card audit',
)
replace_once(
    'src/main.jsx',
    '''    weeklySchedule,
    overrides,
    commitWeeklySchedule,
    commitOverrides,
  } = useSharedTimetable(profile, now)
  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)''',
    '''    weeklySchedule,
    overrides,
    weeklyMeta,
    overrideMeta,
    commitWeeklySchedule,
    commitOverrides,
  } = useSharedTimetable(profile, now)
  const academicData = useSharedAcademicEvents(profile)
  const schoolData = useSchoolData(now, academicData.events)
  const todoData = useTodos(profile)''',
    'app shell shared data',
)
replace_once(
    'src/main.jsx',
    '''        weeklySchedule={weeklySchedule}
        overrides={overrides}
        onSaveWeekly={commitWeeklySchedule}''',
    '''        weeklySchedule={weeklySchedule}
        overrides={overrides}
        weeklyMeta={weeklyMeta}
        overrideMeta={overrideMeta}
        onSaveWeekly={commitWeeklySchedule}''',
    'timetable meta pass',
)
replace_once(
    'src/main.jsx',
    '    academic: <AcademicPage now={now} schoolData={schoolData} />,',
    '    academic: <AcademicPage now={now} schoolData={schoolData} academicData={academicData} />,',
    'academic page props',
)
replace_once(
    'src/main.jsx',
    "  const [installDone, setInstallDone] = useState(() => localStorage.getItem(INSTALL_DONE_KEY) === 'true')\n",
    "  const [installDone, setInstallDone] = useState(() => localStorage.getItem(INSTALL_DONE_KEY) === 'true')\n  const [contactDone, setContactDone] = useState(() => localStorage.getItem(CONTACT_NOTICE_KEY) === 'true')\n",
    'contact state',
)
replace_once(
    'src/main.jsx',
    '''  function saveProfile(nextProfile) {
    const saved = saveStudentProfile(nextProfile)
    if (!saved) return
    localStorage.setItem(USER_NAME_KEY, saved.name)
    setProfile(saved)
  }

  if (!standalone && !installDone) return <InstallGuide onDone={completeInstallGuide} />
  if (!profile) return <StudentSetup initialName={legacyName} onSave={saveProfile} />
  return <AppShell profile={profile} />''',
    '''  function saveProfile(nextProfile) {
    const saved = saveStudentProfile(nextProfile)
    if (!saved) return
    localStorage.setItem(USER_NAME_KEY, saved.name)
    setProfile(saved)
  }

  function confirmContactNotice() {
    localStorage.setItem(CONTACT_NOTICE_KEY, 'true')
    setContactDone(true)
  }

  if (!standalone && !installDone) return <InstallGuide onDone={completeInstallGuide} />
  if (!profile) return <StudentSetup initialName={legacyName} onSave={saveProfile} />
  if (!contactDone) return <ContactNotice onConfirm={confirmContactNotice} />
  return <AppShell profile={profile} />''',
    'contact flow',
)

# school-sync.js: audit, identity, reminders, timetable metadata, academic shared events
replace_once(
    'src/school-sync.js',
    '''  collection,
  doc,
  getCountFromServer,''',
    '''  collection,
  deleteDoc,
  doc,
  getCountFromServer,''',
    'firestore delete import',
)
replace_once(
    'src/school-sync.js',
    '''  loadOverrides,
  loadWeeklySchedule,
  normalizeOverrides,''',
    '''  WEEKDAYS,
  loadOverrides,
  loadWeeklySchedule,
  normalizeOverrides,''',
    'weekday import',
)
insert_before(
    'src/school-sync.js',
    'export function normalizeStudentProfile',
    '''function safeAudit(value) {
  if (!value || typeof value !== 'object') return null
  const name = normalizeName(value.name)
  const studentKey = String(value.studentKey || '').trim().slice(0, 80)
  const action = value.action === 'modified' ? 'modified' : value.action === 'added' ? 'added' : ''
  const updatedAt = Number(value.updatedAt || 0)
  if (!name || studentKey.length < 16 || !action || !Number.isInteger(updatedAt) || updatedAt <= 0) return null
  return { name, studentKey, action, updatedAt }
}

function auditFor(profile, action) {
  const normalized = normalizeStudentProfile(profile)
  const studentKey = studentKeyFor(profile)
  if (!normalized || !studentKey) return null
  return {
    name: normalized.name,
    studentKey,
    action: action === 'modified' ? 'modified' : 'added',
    updatedAt: Date.now(),
  }
}

function normalizeWeeklyMeta(value) {
  const result = {}
  for (const day of WEEKDAYS) {
    const dayMeta = {}
    for (let period = 1; period <= day.regularPeriodCount; period += 1) {
      const audit = safeAudit(value?.[day.id]?.[period])
      if (audit) dayMeta[period] = audit
    }
    if (Object.keys(dayMeta).length) result[day.id] = dayMeta
  }
  return result
}

function normalizeOverrideMeta(value, overrides = {}) {
  const result = {}
  for (const [dateKeyValue, periodMap] of Object.entries(overrides || {})) {
    const dateMeta = {}
    for (const period of Object.keys(periodMap || {})) {
      const audit = safeAudit(value?.[dateKeyValue]?.[period])
      if (audit) dateMeta[period] = audit
    }
    if (Object.keys(dateMeta).length) result[dateKeyValue] = dateMeta
  }
  return result
}

''',
    'audit helpers',
)
insert_before(
    'src/school-sync.js',
    'function classTodosCollection(profile)',
    '''function identityRef(uid) {
  return doc(db, 'identities', String(uid))
}

async function ensureProfileIdentity(profile) {
  const user = await ensureSignedIn()
  const normalized = normalizeStudentProfile(profile)
  const studentKey = studentKeyFor(profile)
  const classId = classKeyFor(profile)
  if (!normalized || !studentKey || !classId) throw new Error('학생 정보를 확인할 수 없어.')
  await setDoc(identityRef(user.uid), {
    studentKey,
    classId,
    name: normalized.name,
    updatedAt: Date.now(),
  }, { merge: true })
  return user
}

''',
    'identity helper',
)
insert_before(
    'src/school-sync.js',
    'function personalTodoStateCollection(profile)',
    '''function classAcademicEventsCollection(profile) {
  return collection(db, 'classes', classKeyFor(profile), 'academicEvents')
}

function classAcademicEventRef(profile, eventId) {
  return doc(db, 'classes', classKeyFor(profile), 'academicEvents', String(eventId))
}

''',
    'academic refs',
)
replace_once(
    'src/school-sync.js',
    '''  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  return {
    id,
    type,
    title,
    dueDate,
    dueTime,
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
  }''',
    '''  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  const audit = safeAudit(todo.audit)
  return {
    id,
    type,
    title,
    dueDate,
    dueTime,
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
    ...(audit ? { audit } : {}),
  }''',
    'reminder audit normalization',
)
replace_once(
    'src/school-sync.js',
    '''export async function writeSharedTodo(profile, todo) {
  const normalized = safeSharedTodo(todo)
  if (!normalized) throw new Error('Invalid shared reminder')
  await ensureSignedIn()
  await setDoc(classTodoRef(profile, normalized.id), normalized, { merge: true })
}''',
    '''export async function writeSharedTodo(profile, todo) {
  await ensureProfileIdentity(profile)
  const action = Number(todo?.updatedAt || 0) > Number(todo?.createdAt || 0) ? 'modified' : 'added'
  const normalized = safeSharedTodo({ ...todo, audit: auditFor(profile, action) })
  if (!normalized) throw new Error('Invalid shared reminder')
  await setDoc(classTodoRef(profile, normalized.id), normalized, { merge: true })
}''',
    'reminder writer audit',
)
insert_before(
    'src/school-sync.js',
    'async function writeInitialTimetable',
    '''function safeAcademicEvent(value) {
  if (!value || typeof value !== 'object') return null
  const id = String(value.id || '').trim().slice(0, 100)
  const name = String(value.name || '').trim().slice(0, 80)
  const startDate = String(value.startDate || '')
  const endDate = String(value.endDate || '')
  const createdByName = normalizeName(value.createdByName)
  const createdByStudentKey = String(value.createdByStudentKey || '').trim().slice(0, 80)
  const createdAt = Number(value.createdAt || 0)
  const updatedAt = Number(value.updatedAt || 0)
  const audit = safeAudit(value.audit)
  if (!id || !name || !/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate)) return null
  if (endDate < startDate || !createdByName || createdByStudentKey.length < 16) return null
  if (!Number.isInteger(createdAt) || createdAt <= 0 || !Number.isInteger(updatedAt) || updatedAt <= 0 || !audit) return null
  return { id, name, startDate, endDate, createdByName, createdByStudentKey, createdAt, updatedAt, audit }
}

export function useSharedAcademicEvents(profile) {
  const signature = profileSignature(profile)
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!signature) return undefined
    let stopped = false
    let unsubscribe = () => {}
    ensureProfileIdentity(profile)
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          classAcademicEventsCollection(profile),
          (snapshot) => {
            if (stopped) return
            setEvents(snapshot.docs.map((item) => safeAcademicEvent({ id: item.id, ...item.data() })).filter(Boolean))
          },
          (error) => console.error('Academic schedule realtime sync failed:', error),
        )
      })
      .catch((error) => console.error('Academic schedule connection failed:', error))

    return () => {
      stopped = true
      unsubscribe()
    }
  }, [signature])

  const saveEvent = useCallback(async (input) => {
    await ensureProfileIdentity(profile)
    const now = Date.now()
    const requestedId = String(input?.id || '').trim().slice(0, 100)
    const id = requestedId || `${now}-${Math.random().toString(36).slice(2, 8)}`
    const target = classAcademicEventRef(profile, id)
    const existingSnapshot = requestedId ? await getDoc(target) : null
    const existing = existingSnapshot?.exists() ? safeAcademicEvent({ id, ...existingSnapshot.data() }) : null
    if (requestedId && !existing) throw new Error('수정할 학사일정을 찾지 못했어.')

    const name = String(input?.name || '').trim().slice(0, 80)
    const startDate = String(input?.startDate || '')
    const endDate = String(input?.endDate || '')
    if (!name || !/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate) || endDate < startDate) {
      throw new Error('학사일정 내용을 다시 확인해줘.')
    }

    const studentKey = studentKeyFor(profile)
    const normalizedProfile = normalizeStudentProfile(profile)
    const next = safeAcademicEvent({
      id,
      name,
      startDate,
      endDate,
      createdByName: existing?.createdByName || normalizedProfile?.name,
      createdByStudentKey: existing?.createdByStudentKey || studentKey,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      audit: auditFor(profile, existing ? 'modified' : 'added'),
    })
    if (!next) throw new Error('학사일정을 저장할 수 없어.')
    await setDoc(target, next)
    return id
  }, [signature])

  const deleteEvent = useCallback(async (eventId) => {
    await ensureProfileIdentity(profile)
    const target = classAcademicEventRef(profile, eventId)
    const snapshot = await getDoc(target)
    if (!snapshot.exists()) return
    const event = safeAcademicEvent({ id: snapshot.id, ...snapshot.data() })
    if (!event || event.createdByStudentKey !== studentKeyFor(profile)) {
      throw new Error('이 일정은 추가한 사람만 삭제할 수 있어.')
    }
    await deleteDoc(target)
  }, [signature])

  const canDelete = useCallback((event) => Boolean(event?.createdByStudentKey && event.createdByStudentKey === studentKeyFor(profile)), [signature])

  return { events, saveEvent, deleteEvent, canDelete }
}

''',
    'academic hook',
)
replace_once(
    'src/school-sync.js',
    '''  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(value.weeklySchedule),
    overrides: pruneExpiredOverrides(value.overrides || {}),
    updatedAt: Date.now(),
  })''',
    '''  await ensureProfileIdentity(profile)
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(value.weeklySchedule),
    overrides: pruneExpiredOverrides(value.overrides || {}),
    weeklyMeta: normalizeWeeklyMeta(value.weeklyMeta || {}),
    overrideMeta: normalizeOverrideMeta(value.overrideMeta || {}, value.overrides || {}),
    updatedAt: Date.now(),
  })''',
    'initial timetable meta',
)
replace_once(
    'src/school-sync.js',
    '''async function writeWeeklyScheduleCloud(profile, weeklySchedule) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(weeklySchedule),
    updatedAt: Date.now(),
  }, { merge: true })
}''',
    '''async function writeWeeklyScheduleCloud(profile, weeklySchedule, weeklyMeta) {
  await ensureProfileIdentity(profile)
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(weeklySchedule),
    weeklyMeta: normalizeWeeklyMeta(weeklyMeta),
    updatedAt: Date.now(),
  }, { merge: true })
}''',
    'weekly cloud writer',
)
replace_once(
    'src/school-sync.js',
    '''async function writeOverridesCloud(profile, overrides) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    overrides: pruneExpiredOverrides(overrides || {}),
    updatedAt: Date.now(),
  }, { merge: true })
}''',
    '''async function writeOverridesCloud(profile, overrides, overrideMeta) {
  await ensureProfileIdentity(profile)
  const normalizedOverrides = pruneExpiredOverrides(overrides || {})
  await setDoc(timetableRef(profile), {
    overrides: normalizedOverrides,
    overrideMeta: normalizeOverrideMeta(overrideMeta, normalizedOverrides),
    updatedAt: Date.now(),
  }, { merge: true })
}''',
    'override cloud writer',
)
replace_once(
    'src/school-sync.js',
    '''  const [weeklySchedule, setWeeklySchedule] = useState(initialWeeklyRef.current)
  const [overrides, setOverrides] = useState(initialOverridesRef.current)
  const signature = profileSignature(profile)''',
    '''  const [weeklySchedule, setWeeklySchedule] = useState(initialWeeklyRef.current)
  const [overrides, setOverrides] = useState(initialOverridesRef.current)
  const [weeklyMeta, setWeeklyMeta] = useState({})
  const [overrideMeta, setOverrideMeta] = useState({})
  const signature = profileSignature(profile)''',
    'timetable meta state',
)
replace_once(
    'src/school-sync.js',
    '''                weeklySchedule: initialWeeklyRef.current,
                overrides: initialOverridesRef.current,
              }).catch''',
    '''                weeklySchedule: initialWeeklyRef.current,
                overrides: initialOverridesRef.current,
                weeklyMeta: {},
                overrideMeta: {},
              }).catch''',
    'initial timetable call meta',
)
replace_once(
    'src/school-sync.js',
    '''            const nextWeekly = normalizeWeeklySchedule(data.weeklySchedule)
            const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data.overrides), new Date())
            saveWeeklySchedule(nextWeekly)
            saveOverrides(nextOverrides)
            setWeeklySchedule(nextWeekly)
            setOverrides(nextOverrides)''',
    '''            const nextWeekly = normalizeWeeklySchedule(data.weeklySchedule)
            const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data.overrides), new Date())
            const nextWeeklyMeta = normalizeWeeklyMeta(data.weeklyMeta)
            const nextOverrideMeta = normalizeOverrideMeta(data.overrideMeta, nextOverrides)
            saveWeeklySchedule(nextWeekly)
            saveOverrides(nextOverrides)
            setWeeklySchedule(nextWeekly)
            setOverrides(nextOverrides)
            setWeeklyMeta(nextWeeklyMeta)
            setOverrideMeta(nextOverrideMeta)''',
    'snapshot timetable meta',
)
replace_once(
    'src/school-sync.js',
    '''  const commitWeeklySchedule = useCallback((nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    saveWeeklySchedule(normalized)
    setWeeklySchedule(normalized)
    writeWeeklyScheduleCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable save failed:', error))
  }, [signature])''',
    '''  const commitWeeklySchedule = useCallback((nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    const nextMeta = normalizeWeeklyMeta(weeklyMeta)
    for (const day of WEEKDAYS) {
      for (let period = 1; period <= day.regularPeriodCount; period += 1) {
        const before = String(weeklySchedule?.[day.id]?.[period] || '')
        const after = String(normalized?.[day.id]?.[period] || '')
        if (before === after) continue
        if (!nextMeta[day.id]) nextMeta[day.id] = {}
        nextMeta[day.id][period] = auditFor(profile, before.trim() ? 'modified' : 'added')
      }
    }
    saveWeeklySchedule(normalized)
    setWeeklySchedule(normalized)
    setWeeklyMeta(nextMeta)
    writeWeeklyScheduleCloud(profile, normalized, nextMeta)
      .catch((error) => console.error('Shared timetable save failed:', error))
  }, [signature, weeklySchedule, weeklyMeta])''',
    'weekly commit meta',
)
replace_once(
    'src/school-sync.js',
    '''  const commitOverrides = useCallback((nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    saveOverrides(normalized)
    setOverrides(normalized)
    writeOverridesCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable override save failed:', error))
  }, [signature, now])''',
    '''  const commitOverrides = useCallback((nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    const nextMeta = {}
    for (const [dateKeyValue, periodMap] of Object.entries(normalized)) {
      const dateMeta = {}
      for (const [period, subject] of Object.entries(periodMap || {})) {
        const previous = overrides?.[dateKeyValue]?.[period]
        const existingAudit = overrideMeta?.[dateKeyValue]?.[period]
        dateMeta[period] = previous === subject && existingAudit
          ? existingAudit
          : auditFor(profile, previous !== undefined ? 'modified' : 'added')
      }
      if (Object.keys(dateMeta).length) nextMeta[dateKeyValue] = dateMeta
    }
    saveOverrides(normalized)
    setOverrides(normalized)
    setOverrideMeta(nextMeta)
    writeOverridesCloud(profile, normalized, nextMeta)
      .catch((error) => console.error('Shared timetable override save failed:', error))
  }, [signature, now, overrides, overrideMeta])''',
    'override commit meta',
)
replace_once(
    'src/school-sync.js',
    '''    weeklySchedule,
    overrides,
    commitWeeklySchedule,
    commitOverrides,''',
    '''    weeklySchedule,
    overrides,
    weeklyMeta,
    overrideMeta,
    commitWeeklySchedule,
    commitOverrides,''',
    'return timetable meta',
)

# stage3-core: merge class academic events into NEIS stream and preserve custom group metadata
replace_once('src/stage3-core.js', 'export function useSchoolData(now) {', 'export function useSchoolData(now, customAcademicEvents = []) {', 'school data custom events')
replace_once(
    'src/stage3-core.js',
    '''  return {
    mealRanges,
    mealLoadingVersion,
    mealWeek,
    ensureMealWeek,
    academicEvents,
    academicLoading,''',
    '''  const mergedAcademicEvents = useMemo(() => {
    const official = academicEvents.map((event) => ({ ...event, custom: false }))
    const custom = (customAcademicEvents || []).map((event) => {
      const startRaw = String(event.startDate || '').replace(/-/g, '')
      const endRaw = String(event.endDate || event.startDate || '').replace(/-/g, '')
      return {
        id: event.id,
        rawDate: startRaw,
        date: dateFromRaw(startRaw),
        endRawDate: endRaw,
        endDate: dateFromRaw(endRaw),
        name: event.name,
        content: '',
        dayOffType: '',
        relevantToSecondGrade: true,
        custom: true,
        createdByStudentKey: event.createdByStudentKey,
        audit: event.audit || null,
      }
    }).filter((event) => event.date && event.name)
    return [...official, ...custom].sort((a, b) => a.rawDate.localeCompare(b.rawDate) || a.name.localeCompare(b.name))
  }, [academicEvents, customAcademicEvents])

  return {
    mealRanges,
    mealLoadingVersion,
    mealWeek,
    ensureMealWeek,
    academicEvents: mergedAcademicEvents,
    academicLoading,''',
    'merged academic return',
)
replace_once(
    'src/stage3-core.js',
    '''  for (const event of filtered) {
    const last = groups[groups.length - 1]
    const consecutive = last && last.name === event.name && daysBetween(last.endDate, event.date) === 1
    if (consecutive) {''',
    '''  for (const event of filtered) {
    if (event.custom) {
      groups.push({
        id: event.id,
        custom: true,
        name: event.name,
        content: event.content,
        dayOffType: event.dayOffType,
        startDate: event.date,
        endDate: event.endDate || event.date,
        startRawDate: event.rawDate,
        endRawDate: event.endRawDate || event.rawDate,
        createdByStudentKey: event.createdByStudentKey || '',
        audit: event.audit || null,
      })
      continue
    }
    const last = groups[groups.length - 1]
    const consecutive = last && !last.custom && last.name === event.name && daysBetween(last.endDate, event.date) === 1
    if (consecutive) {''',
    'custom academic grouping',
)

# todo audit preservation and row attribution
insert_before(
    'src/todo.jsx',
    '\n\nexport const TODO_TYPES',
    '''
function safeAudit(value) {
  if (!value || typeof value !== 'object') return null
  const name = String(value.name || '').trim().slice(0, 20)
  const studentKey = String(value.studentKey || '').trim().slice(0, 80)
  const action = value.action === 'modified' ? 'modified' : value.action === 'added' ? 'added' : ''
  const updatedAt = Number(value.updatedAt || 0)
  if (!name || studentKey.length < 16 || !action || !Number.isInteger(updatedAt) || updatedAt <= 0) return null
  return { name, studentKey, action, updatedAt }
}
''',
    'todo safe audit',
)
replace_once(
    'src/todo.jsx',
    '''      const summary = safeSummary(todo.summary)
      const attachment = safeAttachment(todo.attachment)
      return {''',
    '''      const summary = safeSummary(todo.summary)
      const attachment = safeAttachment(todo.attachment)
      const audit = safeAudit(todo.audit)
      return {''',
    'todo load audit variable',
)
replace_once(
    'src/todo.jsx',
    '''        ...(summary ? { summary } : {}),
        ...(attachment ? { attachment } : {}),
      }''',
    '''        ...(summary ? { summary } : {}),
        ...(attachment ? { attachment } : {}),
        ...(audit ? { audit } : {}),
      }''',
    'todo load audit spread',
)
replace_once(
    'src/todo.jsx',
    '''function sharedTodoShape(todo) {
  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  return {''',
    '''function sharedTodoShape(todo) {
  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  const audit = safeAudit(todo.audit)
  return {''',
    'shared todo audit variable',
)
replace_once(
    'src/todo.jsx',
    '''    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
  }
}''',
    '''    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
    ...(audit ? { audit } : {}),
  }
}''',
    'shared todo audit spread',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const content = (''',
    '''  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const audit = todo.audit?.name ? `${todo.audit.name}이 ${todo.audit.action === 'modified' ? '수정함' : '추가함'}` : ''
  const content = (''',
    'reminder row audit label',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
    </>''',
    '''      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {audit ? <span className="todo-audit">{audit}</span> : null}
    </>''',
    'reminder row audit render',
)

# Firestore rules
insert_before(
    'firestore.rules',
    '    function validReminderSummary()',
    '''    function validAudit(audit) {
      return audit is map
        && audit.keys().hasOnly(['name', 'studentKey', 'action', 'updatedAt'])
        && audit.keys().hasAll(['name', 'studentKey', 'action', 'updatedAt'])
        && audit.name is string
        && audit.name.size() > 0
        && audit.name.size() <= 20
        && audit.studentKey is string
        && audit.studentKey.size() >= 16
        && audit.studentKey.size() <= 80
        && audit.action in ['added', 'modified']
        && audit.updatedAt is int;
    }

''',
    'rules audit helper',
)
replace_once(
    'firestore.rules',
    '''          'summary', 'attachment'
        ])''',
    '''          'summary', 'attachment', 'audit'
        ])''',
    'reminder audit key',
)
replace_once(
    'firestore.rules',
    '''        && request.resource.data.updatedAt is int
        && validReminderSummary()
        && validReminderAttachment();''',
    '''        && request.resource.data.updatedAt is int
        && (!request.resource.data.keys().hasAny(['audit']) || validAudit(request.resource.data.audit))
        && validReminderSummary()
        && validReminderAttachment();''',
    'reminder audit validation',
)
replace_once(
    'firestore.rules',
    '''      return request.resource.data.keys().hasOnly(['weeklySchedule', 'overrides', 'updatedAt'])
        && request.resource.data.keys().hasAll(['updatedAt'])
        && request.resource.data.get('weeklySchedule', {}) is map
        && request.resource.data.get('overrides', {}) is map
        && request.resource.data.updatedAt is int
        && request.resource.data.keys().hasAny(['weeklySchedule', 'overrides']);''',
    '''      return request.resource.data.keys().hasOnly(['weeklySchedule', 'overrides', 'weeklyMeta', 'overrideMeta', 'updatedAt'])
        && request.resource.data.keys().hasAll(['updatedAt'])
        && request.resource.data.get('weeklySchedule', {}) is map
        && request.resource.data.get('overrides', {}) is map
        && request.resource.data.get('weeklyMeta', {}) is map
        && request.resource.data.get('overrideMeta', {}) is map
        && request.resource.data.updatedAt is int
        && request.resource.data.keys().hasAny(['weeklySchedule', 'overrides']);''',
    'timetable metadata rules',
)
insert_before(
    'firestore.rules',
    '    function validPersonalTodoState()',
    '''    function validIdentity() {
      return request.resource.data.keys().hasOnly(['studentKey', 'classId', 'name', 'updatedAt'])
        && request.resource.data.keys().hasAll(['studentKey', 'classId', 'name', 'updatedAt'])
        && request.resource.data.studentKey is string
        && request.resource.data.studentKey.size() >= 16
        && request.resource.data.studentKey.size() <= 80
        && request.resource.data.classId is string
        && request.resource.data.classId.size() > 0
        && request.resource.data.classId.size() <= 40
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 20
        && request.resource.data.updatedAt is int;
    }

    function sameStudentIdentity(studentKey, classId) {
      return signedIn()
        && exists(/databases/$(database)/documents/identities/$(request.auth.uid))
        && get(/databases/$(database)/documents/identities/$(request.auth.uid)).data.studentKey == studentKey
        && get(/databases/$(database)/documents/identities/$(request.auth.uid)).data.classId == classId;
    }

    function validAcademicEvent(eventId) {
      return request.resource.data.keys().hasOnly([
          'id', 'name', 'startDate', 'endDate', 'createdByName', 'createdByStudentKey',
          'createdAt', 'updatedAt', 'audit'
        ])
        && request.resource.data.keys().hasAll([
          'id', 'name', 'startDate', 'endDate', 'createdByName', 'createdByStudentKey',
          'createdAt', 'updatedAt', 'audit'
        ])
        && request.resource.data.id == eventId
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 80
        && request.resource.data.startDate is string
        && request.resource.data.startDate.size() == 10
        && request.resource.data.endDate is string
        && request.resource.data.endDate.size() == 10
        && request.resource.data.createdByName is string
        && request.resource.data.createdByName.size() > 0
        && request.resource.data.createdByName.size() <= 20
        && request.resource.data.createdByStudentKey is string
        && request.resource.data.createdByStudentKey.size() >= 16
        && request.resource.data.createdByStudentKey.size() <= 80
        && request.resource.data.createdAt is int
        && request.resource.data.updatedAt is int
        && validAudit(request.resource.data.audit);
    }

''',
    'identity academic rules helpers',
)
insert_before(
    'firestore.rules',
    '    match /classes/{classId}/todos/{todoId} {',
    '''    match /identities/{uid} {
      allow read: if signedIn() && uid == request.auth.uid;
      allow create, update: if signedIn() && uid == request.auth.uid && validIdentity();
      allow delete: if false;
    }

    match /classes/{classId}/academicEvents/{eventId} {
      allow read: if signedIn();
      allow create: if signedIn()
        && validAcademicEvent(eventId)
        && sameStudentIdentity(request.resource.data.createdByStudentKey, classId)
        && sameStudentIdentity(request.resource.data.audit.studentKey, classId);
      allow update: if signedIn()
        && validAcademicEvent(eventId)
        && request.resource.data.createdByStudentKey == resource.data.createdByStudentKey
        && request.resource.data.createdByName == resource.data.createdByName
        && request.resource.data.createdAt == resource.data.createdAt
        && sameStudentIdentity(request.resource.data.audit.studentKey, classId);
      allow delete: if sameStudentIdentity(resource.data.createdByStudentKey, classId);
    }

''',
    'academic collection rules',
)

# service worker cache bump
replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v72'", "const CACHE_NAME = 'school-shell-v73'", 'service worker cache bump')

print('academic audit contact patch applied')
