from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1))


def append_if_missing(path, marker, addition):
    target = Path(path)
    text = target.read_text()
    if marker in text:
        return
    target.write_text(text.rstrip() + '\n\n' + addition.strip() + '\n')


# Keep uncertain AI extraction visible for manual correction instead of silently dropping it.
replace_once(
    'src/s-hub-ai-core.js',
    """  if (raw.kind === 'reminder') {
    const title = clampText(raw.title, 80)
    const dueDate = clampText(raw.dueDate, 10)
    if (!title || !validDateKey(dueDate) || dueDate < today) return null
    return {
      id,
      kind: 'reminder',
      confidence,
      reason,
      type: REMINDER_TYPES.has(raw.type) ? raw.type : 'task',
      title,
      dueDate,
      dueTime: validTime(raw.dueTime) ? String(raw.dueTime) : '',
    }
  }

  if (raw.kind === 'timetable_change') {
    const date = clampText(raw.date, 10)
    const period = Number(raw.period)
    const subject = clampText(raw.subject, 20)
    if (!validDateKey(date) || date < today || !Number.isInteger(period) || period < 1 || period > 7 || !subject) return null
    return {
      id,
      kind: 'timetable_change',
      confidence,
      reason,
      title: clampText(raw.title, 80) || `${period}교시 ${subject}`,
      date,
      period,
      subject,
    }
  }

  const title = clampText(raw.title, 80)
  const startDate = clampText(raw.startDate, 10)
  const endDate = clampText(raw.endDate || raw.startDate, 10)
  if (!title || !validDateKey(startDate) || !validDateKey(endDate) || endDate < startDate || endDate < today) return null
  return {
    id,
    kind: 'academic',
    confidence,
    reason,
    title,
    startDate,
    endDate,
    detail: clampText(raw.detail, 500),
    important: Boolean(raw.important) || IMPORTANT_ACADEMIC_PATTERN.test(title),
  }
""",
    """  if (raw.kind === 'reminder') {
    const title = clampText(raw.title, 80)
    const dueDate = clampText(raw.dueDate, 10)
    if (!title) return null
    const valid = validDateKey(dueDate) && dueDate >= today
    return {
      id,
      kind: 'reminder',
      confidence: valid ? confidence : 'low',
      reason,
      type: REMINDER_TYPES.has(raw.type) ? raw.type : 'task',
      title,
      dueDate: valid ? dueDate : '',
      dueTime: valid && validTime(raw.dueTime) ? String(raw.dueTime) : '',
      valid,
    }
  }

  if (raw.kind === 'timetable_change') {
    const date = clampText(raw.date, 10)
    const period = Number(raw.period)
    const subject = clampText(raw.subject, 20)
    const valid = validDateKey(date) && date >= today && Number.isInteger(period) && period >= 1 && period <= 7 && Boolean(subject)
    return {
      id,
      kind: 'timetable_change',
      confidence: valid ? confidence : 'low',
      reason,
      title: clampText(raw.title, 80) || (subject ? `${Number.isInteger(period) && period > 0 ? `${period}교시 ` : ''}${subject}` : '시간표 변경'),
      date: validDateKey(date) ? date : '',
      period: Number.isInteger(period) && period >= 1 && period <= 7 ? period : 0,
      subject,
      valid,
    }
  }

  const title = clampText(raw.title, 80)
  if (!title) return null
  const rawStartDate = clampText(raw.startDate, 10)
  const rawEndDate = clampText(raw.endDate || raw.startDate, 10)
  const valid = validDateKey(rawStartDate) && validDateKey(rawEndDate) && rawEndDate >= rawStartDate && rawEndDate >= today
  return {
    id,
    kind: 'academic',
    confidence: valid ? confidence : 'low',
    reason,
    title,
    startDate: validDateKey(rawStartDate) ? rawStartDate : '',
    endDate: validDateKey(rawEndDate) ? rawEndDate : '',
    detail: clampText(raw.detail, 500),
    important: Boolean(raw.important) || IMPORTANT_ACADEMIC_PATTERN.test(title),
    valid,
  }
""",
)

replace_once(
    'src/s-hub-ai-core.js',
    """export function findDeterministicConflict(item, context) {
  if (!item || !context) return null
""",
    """export function findDeterministicConflict(item, context) {
  if (!item || !context || item.valid === false) return null
""",
)

replace_once(
    'src/s-hub-ai-core.js',
    """export function semanticConflictShortlist(item, context, limit = 5) {
  if (!item || !context || item.kind === 'timetable_change') return []
""",
    """export function semanticConflictShortlist(item, context, limit = 5) {
  if (!item || !context || item.valid === false || item.kind === 'timetable_change') return []
""",
)

replace_once(
    'src/s-hub-ai-core.js',
    """  for (const item of items || []) {
    if (findDeterministicConflict(item, context)) continue
""",
    """  for (const item of items || []) {
    if (item?.valid === false || findDeterministicConflict(item, context)) continue
""",
)

# Reuse the existing, already battle-tested attachment preparation pipeline.
replace_once(
    'src/firebase-ai.js',
    'async function prepareAttachment(file) {',
    'export async function prepareAttachment(file) {',
)

# Add a generic structured-json runner that shares the current model cooldown/fallback policy.
append_if_missing(
    'src/firebase-ai-direct.js',
    'export async function generateDirectStructured',
    r'''
async function runRawStructuredModel(modelName, {
  prompt,
  attachments,
  responseSchema,
  maxOutputTokens,
  timeoutMs,
  temperature,
}) {
  const parts = [
    { text: String(prompt || '') },
    ...(attachments || []).map(preparedPart).filter(Boolean),
  ]
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(rawFirebaseEndpoint(modelName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': firebaseConfig.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature,
          maxOutputTokens,
        },
      }),
      signal: controller.signal,
    })
    const rawText = await response.text()
    let payload = null
    try { payload = rawText ? JSON.parse(rawText) : null } catch { payload = null }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || rawText || `Structured Firebase AI HTTP ${response.status}`)
      error.name = 'ReminderAIError'
      error.code = payload?.error?.status || `school-ai/structured-http-${response.status}`
      error.status = response.status
      error.retryAfterMs = retryAfterMilliseconds(response.headers.get('Retry-After'))
      throw error
    }
    const responseText = String(payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '').trim()
    if (!responseText) throw new Error(`Structured Firebase AI ${modelName} returned an empty response`)
    return JSON.parse(responseText)
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error(`Structured Firebase AI ${modelName} timed out`)
      timeout.name = 'ReminderAIError'
      timeout.code = 'school-ai/structured-timeout'
      timeout.status = 504
      throw timeout
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function generateDirectStructured({
  prompt = '',
  attachments = [],
  responseSchema,
  maxOutputTokens = 1600,
  timeoutMs = 26000,
  temperature = 0.05,
} = {}) {
  if (!String(prompt || '').trim() || !responseSchema || typeof responseSchema !== 'object') {
    const error = new Error('Structured AI request is missing a prompt or response schema')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/structured-invalid-request'
    throw error
  }

  const attempts = []
  let lastError = null
  const now = Date.now()
  const availableModels = FALLBACK_MODELS.filter((modelName) => !modelIsCoolingDown(modelName, now))
  if (!availableModels.length) {
    const error = new Error('All AI fallback models are temporarily cooling down after quota errors')
    error.name = 'ReminderAIError'
    error.code = 'school-ai/all-models-cooling-down'
    error.status = 429
    error.customData = { attempts: ['all models skipped by adaptive quota cooldown'] }
    throw error
  }

  for (const modelName of availableModels) {
    const startedAt = Date.now()
    try {
      const value = await runRawStructuredModel(modelName, {
        prompt,
        attachments,
        responseSchema,
        maxOutputTokens: Math.max(200, Math.min(Number(maxOutputTokens) || 1600, 5000)),
        timeoutMs: Math.max(4000, Math.min(Number(timeoutMs) || 26000, 60000)),
        temperature: Math.max(0, Math.min(Number(temperature) || 0, 1)),
      })
      markModelSuccess(modelName)
      return { value, modelName, attempts }
    } catch (error) {
      lastError = error
      markModelQuotaFailure(modelName, error)
      attempts.push(`${modelName}: ${error?.code || error?.name || 'error'} (${Date.now() - startedAt}ms)`)
    }
  }

  const error = new Error(attempts.join(' | ') || lastError?.message || 'Structured AI fallback failed')
  error.name = 'ReminderAIError'
  error.code = 'school-ai/structured-all-models-failed'
  error.status = lastError?.status || null
  error.customData = { attempts }
  throw error
}
''',
)

# Main shell: one quiet entry point on Home, no extra tab.
replace_once(
    'src/main.jsx',
    "import { activityKey, activityLabel, recordClassActivities, useClassActivity, useSharedAcademic } from './class-activity'\n",
    "import { activityKey, activityLabel, recordClassActivities, useClassActivity, useSharedAcademic } from './class-activity'\nimport { SchoolAISheet } from './s-hub-ai-sheet.jsx'\nimport { buildSchoolAIContext } from './s-hub-ai-core.js'\n",
)

replace_once(
    'src/main.jsx',
    """  if (type === 'clock') {
    return <svg {...common}><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5v5l3.2 2\"/></svg>
  }
""",
    """  if (type === 'search') {
    return <svg {...common}><circle cx=\"10.7\" cy=\"10.7\" r=\"6.4\"/><path d=\"m15.5 15.5 4.2 4.2\"/></svg>
  }
  if (type === 'clock') {
    return <svg {...common}><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5v5l3.2 2\"/></svg>
  }
""",
)

replace_once(
    'src/main.jsx',
    'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData }) {',
    'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData, onOpenAI }) {',
)

replace_once(
    'src/main.jsx',
    '        <span className="user-name">{name}</span>\n',
    '''        <div className="home-top-actions">
          <span className="user-name">{name}</span>
          <button className="home-ai-trigger" type="button" aria-label="S-Hub 검색 및 공지 분석" onClick={onOpenAI}>
            <Icon type="search" size={18} />
          </button>
        </div>
''',
)

replace_once(
    'src/main.jsx',
    """function AppShell({ profile }) {
  const [activeTab, setActiveTab] = useState('home')
  const [contentDirection, setContentDirection] = useState(1)
""",
    """function AppShell({ profile }) {
  const [activeTab, setActiveTab] = useState('home')
  const [contentDirection, setContentDirection] = useState(1)
  const [aiOpen, setAiOpen] = useState(false)
""",
)

replace_once(
    'src/main.jsx',
    """  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  useEffect(() => {
""",
    r'''  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)

  const aiContext = useMemo(() => {
    const timetableDays = Array.from({ length: 8 }, (_, offset) => {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12, 0, 0, 0)
      return {
        date: dateKey(targetDate),
        periods: getScheduleForDate(targetDate, weeklySchedule, overrides).map((period) => ({
          number: period.number,
          subject: period.subject || '',
          baseSubject: period.baseSubject || period.subject || '',
          isOverride: Boolean(period.isOverride),
          start: period.start || '',
          end: period.end || '',
        })),
      }
    })
    return buildSchoolAIContext({
      now,
      todos: todoData.todos,
      timetableDays,
      academicEvents: schoolData?.academicEvents || [],
      customAcademicEvents: academicData?.events || [],
    })
  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, academicData?.events])

  async function importAIItems(items) {
    const saved = []
    const failed = []
    const timetableItems = []
    const seenReminder = new Set()
    const seenAcademic = new Set()
    const seenTimetable = new Set()

    for (const item of Array.isArray(items) ? items : []) {
      if (!item || item.valid === false) {
        failed.push({ item, message: '필수 정보를 확인해줘.' })
        continue
      }

      try {
        if (item.kind === 'reminder') {
          const batchKey = `${String(item.title || '').trim().toLowerCase()}|${item.dueDate}|${item.dueTime || ''}`
          if (seenReminder.has(batchKey)) throw new Error('같은 분석 결과 안에 동일한 리마인더가 두 번 있어.')
          seenReminder.add(batchKey)
          const targetId = item.resolution === 'replace' ? String(item.existingId || '') : ''
          if (item.resolution === 'replace' && !targetId) throw new Error('수정할 기존 리마인더를 찾지 못했어.')
          const savedId = await todoData.saveTodo({
            id: targetId,
            type: item.type,
            title: item.title,
            dueDate: item.dueDate,
            dueTime: item.dueTime || '',
          })
          if (!savedId) throw new Error('리마인더를 저장하지 못했어.')
          saved.push({ item, id: savedId })
          continue
        }

        if (item.kind === 'academic') {
          const batchKey = `${String(item.title || '').trim().toLowerCase()}|${item.startDate}|${item.endDate}`
          if (seenAcademic.has(batchKey)) throw new Error('같은 분석 결과 안에 동일한 학사일정이 두 번 있어.')
          seenAcademic.add(batchKey)
          const targetId = item.resolution === 'replace' ? String(item.existingId || '') : ''
          if (item.resolution === 'replace' && item.existingSource !== 'custom') {
            throw new Error('공식 학사일정은 AI가 수정하지 않아.')
          }
          const savedEvent = await academicData.saveEvent({
            id: targetId,
            title: item.title,
            startDate: item.startDate,
            endDate: item.endDate,
            detail: item.detail || '',
            important: Boolean(item.important),
          })
          if (!savedEvent?.id) throw new Error('학사일정을 저장하지 못했어.')
          saved.push({ item, id: savedEvent.id })
          continue
        }

        if (item.kind === 'timetable_change') {
          const slot = `${item.date}-${item.period}`
          if (seenTimetable.has(slot)) throw new Error('같은 분석 결과 안에 동일한 교시 변경이 두 번 있어.')
          seenTimetable.add(slot)
          const targetDate = dateFromKey(item.date)
          const targetDay = targetDate ? getDayForDate(targetDate) : null
          const allowed = targetDay
            ? getPeriodsForDay(targetDay.id).some((period) => period.number === Number(item.period))
            : false
          if (!targetDate || !targetDay || !allowed) throw new Error('이 날짜에는 선택한 교시를 변경할 수 없어.')
          timetableItems.push({ ...item, targetDay })
          continue
        }

        throw new Error('지원하지 않는 일정 종류야.')
      } catch (error) {
        failed.push({ item, message: error?.message || '저장 실패' })
      }
    }

    if (timetableItems.length) {
      const nextOverrides = { ...overrides }
      const applied = []
      const activities = []

      timetableItems.forEach((item) => {
        const dateOverrides = { ...(nextOverrides[item.date] || {}) }
        const beforeSubject = String(dateOverrides[item.period] || '')
        const nextSubject = String(item.subject || '').trim().slice(0, 20)
        const baseSubject = String(weeklySchedule?.[item.targetDay.id]?.[item.period] || '').trim()

        if (!nextSubject) {
          failed.push({ item, message: '변경 과목이 비어 있어.' })
          return
        }

        if (nextSubject === baseSubject) delete dateOverrides[item.period]
        else dateOverrides[item.period] = nextSubject

        if (Object.keys(dateOverrides).length) nextOverrides[item.date] = dateOverrides
        else delete nextOverrides[item.date]

        const afterSubject = String(nextOverrides?.[item.date]?.[item.period] || '')
        if (beforeSubject === afterSubject) {
          saved.push({ item, id: `${item.date}-${item.period}`, unchanged: true })
          return
        }

        applied.push(item)
        activities.push({
          entityType: 'timetable',
          entityId: `${item.date}-${item.period}`,
          action: beforeSubject ? 'edited' : 'added',
        })
      })

      if (applied.length) {
        try {
          const committed = await commitOverrides(nextOverrides)
          if (!committed) throw new Error('시간표 변경을 저장하지 못했어.')
          applied.forEach((item) => saved.push({ item, id: `${item.date}-${item.period}` }))
          recordClassActivities(profile, activities)
            .catch((error) => console.error('AI timetable attribution save failed:', error))
        } catch (error) {
          applied.forEach((item) => failed.push({ item, message: error?.message || '시간표 저장 실패' }))
        }
      }
    }

    return { saved, failed }
  }

  useEffect(() => {
''',
)

replace_once(
    'src/main.jsx',
    """        presence={presence}
        academicData={academicData}
      />
""",
    """        presence={presence}
        academicData={academicData}
        onOpenAI={() => setAiOpen(true)}
      />
""",
)

replace_once(
    'src/main.jsx',
    """      </nav>
      <OfflineToast toast={toast} />
""",
    """      </nav>
      <SchoolAISheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        now={now}
        context={aiContext}
        onImportItems={importAIItems}
        requireOnline={requireOnline}
      />
      <OfflineToast toast={toast} />
""",
)

# Normal reminder creation/editing gets the same safe conflict layer.
replace_once(
    'src/todo-stage5-ai.jsx',
    "import { parseReminderTitleWithAI, parseReminderWithAI } from './firebase-ai.js'\n",
    "import { parseReminderTitleWithAI, parseReminderWithAI } from './firebase-ai.js'\nimport { findReminderConflict } from './s-hub-ai.js'\n",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  const [serverSaving, setServerSaving] = useState(false)
  const [serverSaveError, setServerSaveError] = useState('')
  const [summaryTodo, setSummaryTodo] = useState(null)
""",
    """  const [serverSaving, setServerSaving] = useState(false)
  const [serverSaveError, setServerSaveError] = useState('')
  const [conflictChecking, setConflictChecking] = useState(false)
  const [reminderConflict, setReminderConflict] = useState(null)
  const [summaryTodo, setSummaryTodo] = useState(null)
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  const summaryPromiseRef = useRef(null)
  const pendingCreateIdRef = useRef('')
""",
    """  const summaryPromiseRef = useRef(null)
  const pendingCreateIdRef = useRef('')
  const conflictApprovalRef = useRef('')
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  const aiTrigger = attachmentSignature ? `${naturalText}|${attachmentSignature}` : naturalText

  useEffect(() => {
""",
    """  const aiTrigger = attachmentSignature ? `${naturalText}|${attachmentSignature}` : naturalText

  useEffect(() => {
    if (!sheetOpen) return
    setReminderConflict(null)
    conflictApprovalRef.current = ''
  }, [sheetOpen, aiTrigger, sheetMode, draft.type, draft.title, draft.dueDate, draft.dueTime])

  useEffect(() => {
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  async function submitNatural() {
    const fallbackResult = aiState === 'error' && !attachmentFiles.length ? localNaturalResult : null
    const result = aiResult || fallbackResult
    if (!result?.title || !result?.dueDate || serverSaving) return
    if (!requireOnline('리마인더를 추가')) return
    const createId = pendingCreateIdRef.current || createTodoId()
""",
    r'''  function reminderConflictSignature(candidate) {
    return [
      candidate?.id || '',
      candidate?.type || 'task',
      String(candidate?.title || '').trim(),
      candidate?.dueDate || '',
      candidate?.dueTime || '',
    ].join('|')
  }

  async function confirmReminderConflict(candidate) {
    const signature = reminderConflictSignature(candidate)
    if (conflictApprovalRef.current === signature) {
      conflictApprovalRef.current = ''
      return true
    }

    setConflictChecking(true)
    try {
      const conflict = await findReminderConflict(candidate, todos, new Date(), { excludeId: candidate?.id || '' })
      if (!conflict) {
        setReminderConflict(null)
        return true
      }
      setReminderConflict({ ...conflict, candidate, signature })
      return false
    } catch (error) {
      console.warn('Reminder duplicate check unavailable; continuing with existing save path.', error)
      return true
    } finally {
      setConflictChecking(false)
    }
  }

  function approveReminderConflict() {
    if (!reminderConflict?.signature) return
    conflictApprovalRef.current = reminderConflict.signature
    setReminderConflict(null)
    if (sheetMode === 'natural') void submitNatural()
    else void submitManual()
  }

  async function submitNatural() {
    const fallbackResult = aiState === 'error' && !attachmentFiles.length ? localNaturalResult : null
    const result = aiResult || fallbackResult
    if (!result?.title || !result?.dueDate || serverSaving || conflictChecking) return
    if (!requireOnline('리마인더를 추가')) return
    if (!(await confirmReminderConflict({
      id: '',
      type: result.type,
      title: result.title,
      dueDate: result.dueDate,
      dueTime: result.dueTime || '',
    }))) return
    const createId = pendingCreateIdRef.current || createTodoId()
''',
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  async function submitManual() {
    if (serverSaving) return
    if (!requireOnline(draft.id ? '리마인더를 수정' : '리마인더를 추가')) return
    const createId = draft.id ? '' : (pendingCreateIdRef.current || createTodoId())
""",
    """  async function submitManual() {
    if (serverSaving || conflictChecking) return
    if (!requireOnline(draft.id ? '리마인더를 수정' : '리마인더를 추가')) return
    if (!(await confirmReminderConflict(draft))) return
    const createId = draft.id ? '' : (pendingCreateIdRef.current || createTodoId())
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  const saveDisabled = serverSaving || (sheetMode === 'natural'
""",
    """  const saveDisabled = serverSaving || conflictChecking || (sheetMode === 'natural'
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    '        closeDisabled={serverSaving}\n',
    '        closeDisabled={serverSaving || conflictChecking}\n',
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """            {serverSaveError ? <p className=\"change-warning\">{serverSaveError}</p> : null}

            <div className=\"change-submit-row\">
""",
    """            {serverSaveError ? <p className=\"change-warning\">{serverSaveError}</p> : null}
            {reminderConflict ? (
              <div className=\"reminder-conflict-warning\">
                <strong>{reminderConflict.relation === 'duplicate' ? '비슷한 일정이 이미 있어' : '기존 일정과 정보가 달라'}</strong>
                <span>{reminderConflict.existing?.title || '기존 리마인더'} · {reminderConflict.existing?.dueDate || ''}{reminderConflict.existing?.dueTime ? ` ${reminderConflict.existing.dueTime}` : ''}</span>
                {reminderConflict.reason ? <small>{reminderConflict.reason}</small> : null}
                <div>
                  <button type=\"button\" onClick={() => setReminderConflict(null)}>취소</button>
                  <button type=\"button\" onClick={approveReminderConflict}>그래도 저장</button>
                </div>
              </div>
            ) : null}

            <div className=\"change-submit-row\">
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    "{serverSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}",
    "{conflictChecking ? '중복 확인 중…' : serverSaving ? '저장 중…' : sheetMode === 'natural' ? '추가' : '저장'}",
)

# Force installed PWAs to refresh the newly bundled AI UI rather than retaining the old app shell.
replace_once(
    'public/sw.js',
    "const CACHE_NAME = 'school-shell-v140'",
    "const CACHE_NAME = 'school-shell-v141'",
)
