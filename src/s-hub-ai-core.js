const IMPORT_KINDS = new Set(['reminder', 'timetable_change', 'academic'])
const REMINDER_TYPES = new Set(['task', 'performance', 'exam', 'material'])
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low'])
const IMPORTANT_ACADEMIC_PATTERN = /중간|기말|정기시험|정기고사|지필|모의고사|전국연합|학력평가|평가원|수능|대학수학능력시험/

function pad(value) {
  return String(value).padStart(2, '0')
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function validDateKey(value) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

function dateFromKey(value) {
  if (!validDateKey(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function dateDistance(first, second) {
  const a = dateFromKey(first)
  const b = dateFromKey(second)
  if (!a || !b) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((a - b) / 86400000))
}

function clampText(value, maxLength) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

export function compactSchoolTitle(value) {
  return clampText(value, 120)
    .toLowerCase()
    .replace(/[\s·•ㆍ.,/\\()\[\]{}'"`~!@#$%^&*+=:;?<>_-]+/g, '')
}

function bigrams(value) {
  const text = compactSchoolTitle(value)
  if (!text) return []
  if (text.length === 1) return [text]
  const result = []
  for (let index = 0; index < text.length - 1; index += 1) result.push(text.slice(index, index + 2))
  return result
}

export function titleSimilarity(first, second) {
  const a = compactSchoolTitle(first)
  const b = compactSchoolTitle(second)
  if (!a || !b) return 0
  if (a === b) return 1
  const left = bigrams(a)
  const right = bigrams(b)
  const remaining = [...right]
  let matches = 0
  left.forEach((token) => {
    const index = remaining.indexOf(token)
    if (index < 0) return
    matches += 1
    remaining.splice(index, 1)
  })
  return (2 * matches) / (left.length + right.length)
}

function normalizeConfidence(value) {
  return CONFIDENCE_LEVELS.has(value) ? value : 'low'
}

export function normalizeImportItem(raw, index = 0, now = new Date()) {
  if (!raw || typeof raw !== 'object' || !IMPORT_KINDS.has(raw.kind)) return null
  const today = localDateKey(now)
  const id = clampText(raw.id, 80) || `candidate-${index + 1}`
  const confidence = normalizeConfidence(raw.confidence)
  const reason = clampText(raw.reason, 240)

  if (raw.kind === 'reminder') {
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
}

export function normalizeImportItems(payload, now = new Date()) {
  const values = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : []
  const seen = new Set()
  const result = []
  values.slice(0, 10).forEach((raw, index) => {
    const item = normalizeImportItem(raw, index, now)
    if (!item) return
    let id = item.id
    while (seen.has(id)) id = `${item.id}-${index + 1}`
    seen.add(id)
    result.push({ ...item, id })
  })
  return result
}

function unknownDateKey(value) {
  if (validDateKey(value)) return String(value)
  const raw = String(value || '')
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  if (value instanceof Date) return localDateKey(value)
  if (value?.toDate instanceof Function) return localDateKey(value.toDate())
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? localDateKey(parsed) : ''
}

function normalizeContextReminder(todo, today) {
  if (!todo || todo.completed) return null
  const dueDate = String(todo.dueDate || '')
  const title = clampText(todo.title, 80)
  if (!title || !validDateKey(dueDate) || dueDate < today) return null
  return {
    id: String(todo.id || '').slice(0, 100),
    type: REMINDER_TYPES.has(todo.type) ? todo.type : 'task',
    title,
    dueDate,
    dueTime: validTime(todo.dueTime) ? String(todo.dueTime) : '',
  }
}

function normalizeTimetableDay(day) {
  const date = String(day?.date || '')
  if (!validDateKey(date)) return null
  const periods = Array.isArray(day?.periods) ? day.periods : []
  return {
    date,
    periods: periods.slice(0, 7).map((period) => ({
      number: Number(period?.number || 0),
      subject: clampText(period?.subject, 20),
      baseSubject: clampText(period?.baseSubject, 20),
      isOverride: Boolean(period?.isOverride),
      start: clampText(period?.start, 5),
      end: clampText(period?.end, 5),
    })).filter((period) => Number.isInteger(period.number) && period.number >= 1 && period.number <= 7),
  }
}

function normalizeOfficialAcademic(event, today, index) {
  const date = unknownDateKey(event?.date || event?.rawDate)
  const title = clampText(event?.name || event?.title, 80)
  if (!date || !title || date < today) return null
  return {
    id: `official-${String(event?.rawDate || date).replace(/[^0-9]/g, '')}-${index}`,
    source: 'official',
    title,
    startDate: date,
    endDate: date,
    detail: clampText(event?.content || event?.detail, 300),
    important: Boolean(event?.important) || IMPORTANT_ACADEMIC_PATTERN.test(title),
  }
}

function normalizeCustomAcademic(event, today) {
  const startDate = String(event?.startDate || '')
  const endDate = String(event?.endDate || startDate)
  const title = clampText(event?.title, 80)
  if (!event?.id || !title || !validDateKey(startDate) || !validDateKey(endDate) || endDate < today) return null
  return {
    id: String(event.id).slice(0, 120),
    source: 'custom',
    title,
    startDate,
    endDate,
    detail: clampText(event?.detail, 300),
    important: Boolean(event?.important) || IMPORTANT_ACADEMIC_PATTERN.test(title),
  }
}

export function buildSchoolAIContext({
  now = new Date(),
  todos = [],
  timetableDays = [],
  academicEvents = [],
  customAcademicEvents = [],
} = {}) {
  const today = localDateKey(now)
  const reminders = (todos || [])
    .map((todo) => normalizeContextReminder(todo, today))
    .filter(Boolean)
    .sort((a, b) => `${a.dueDate}T${a.dueTime || '23:59'}`.localeCompare(`${b.dueDate}T${b.dueTime || '23:59'}`))
    .slice(0, 60)

  const timetable = (timetableDays || [])
    .map(normalizeTimetableDay)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)

  const official = (academicEvents || [])
    .map((event, index) => normalizeOfficialAcademic(event, today, index))
    .filter(Boolean)
  const custom = (customAcademicEvents || [])
    .map((event) => normalizeCustomAcademic(event, today))
    .filter(Boolean)
  const academic = [...official, ...custom]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
    .slice(0, 60)

  return {
    reference: `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    reminders,
    timetable,
    academic,
  }
}

function conflictResult(item, existing, relation, reason, source = 'local', confidence = 'high') {
  return {
    candidateId: item.id,
    relation,
    existingKind: item.kind,
    existingId: existing.id,
    existing,
    reason,
    source,
    confidence,
  }
}

function timetableEntries(context) {
  return (context?.timetable || []).flatMap((day) => (day.periods || []).map((period) => ({
    id: `${day.date}-${period.number}`,
    date: day.date,
    period: period.number,
    subject: period.subject,
    baseSubject: period.baseSubject,
    isOverride: period.isOverride,
  })))
}

export function findDeterministicConflict(item, context) {
  if (!item || !context || item.valid === false) return null

  if (item.kind === 'timetable_change') {
    const existing = timetableEntries(context).find((entry) => entry.date === item.date && entry.period === item.period)
    if (!existing) return null
    const currentSubject = compactSchoolTitle(existing.subject)
    const nextSubject = compactSchoolTitle(item.subject)
    if (currentSubject && nextSubject && currentSubject === nextSubject) {
      return conflictResult(item, existing, 'duplicate', '같은 날짜와 교시에 이미 같은 과목이 등록돼 있어.')
    }
    if (existing.isOverride) {
      return conflictResult(item, existing, 'conflict', '같은 날짜와 교시에 다른 변경 시간표가 이미 있어.')
    }
    return null
  }

  if (item.kind === 'reminder') {
    const key = compactSchoolTitle(item.title)
    if (!key) return null
    for (const existing of context.reminders || []) {
      if (existing.id === item.id) continue
      if (compactSchoolTitle(existing.title) !== key) continue
      if (existing.dueDate === item.dueDate) {
        if (!existing.dueTime || !item.dueTime || existing.dueTime === item.dueTime) {
          return conflictResult(item, existing, 'duplicate', '같은 제목과 날짜의 리마인더가 이미 있어.')
        }
        return conflictResult(item, existing, 'conflict', '같은 리마인더로 보이지만 시간이 달라.')
      }
      if (dateDistance(existing.dueDate, item.dueDate) <= 30) {
        return conflictResult(item, existing, 'conflict', '같은 리마인더로 보이지만 날짜가 달라.')
      }
    }
    return null
  }

  const key = compactSchoolTitle(item.title)
  if (!key) return null
  for (const existing of context.academic || []) {
    if (compactSchoolTitle(existing.title) !== key) continue
    if (existing.startDate === item.startDate && existing.endDate === item.endDate) {
      return conflictResult(item, existing, 'duplicate', '같은 학사일정이 이미 있어.')
    }
    if (dateDistance(existing.startDate, item.startDate) <= 120) {
      return conflictResult(item, existing, 'conflict', '같은 학사일정으로 보이지만 날짜가 달라.')
    }
  }
  return null
}

function scoreReminderCandidate(item, existing) {
  const similarity = titleSimilarity(item.title, existing.title)
  const sameDate = item.dueDate === existing.dueDate
  const sameType = item.type === existing.type
  if (similarity < 0.22 && !sameDate) return 0
  const distance = dateDistance(item.dueDate, existing.dueDate)
  if (distance > 45 && similarity < 0.72) return 0
  return similarity + (sameDate ? 0.28 : 0) + (sameType ? 0.08 : 0) + (distance <= 7 ? 0.06 : 0)
}

function scoreAcademicCandidate(item, existing) {
  const similarity = titleSimilarity(item.title, existing.title)
  const distance = dateDistance(item.startDate, existing.startDate)
  if (similarity < 0.28 || distance > 180) return 0
  return similarity + (distance === 0 ? 0.28 : distance <= 14 ? 0.08 : 0)
}

export function semanticConflictShortlist(item, context, limit = 5) {
  if (!item || !context || item.valid === false || item.kind === 'timetable_change') return []
  const source = item.kind === 'reminder' ? context.reminders || [] : context.academic || []
  return source
    .filter((existing) => existing.id !== item.id)
    .map((existing) => ({
      existing,
      score: item.kind === 'reminder'
        ? scoreReminderCandidate(item, existing)
        : scoreAcademicCandidate(item, existing),
    }))
    .filter((entry) => entry.score >= 0.42)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.existing)
}

export function buildSemanticConflictPairs(items, context) {
  const pairs = []
  for (const item of items || []) {
    if (item?.valid === false || findDeterministicConflict(item, context)) continue
    const shortlist = semanticConflictShortlist(item, context, 5)
    if (!shortlist.length) continue
    pairs.push({
      candidate: item,
      existing: shortlist,
    })
    if (pairs.length >= 10) break
  }
  return pairs
}

export function existingContextEntry(context, kind, id) {
  if (!id) return null
  if (kind === 'reminder') return (context?.reminders || []).find((item) => item.id === id) || null
  if (kind === 'academic') return (context?.academic || []).find((item) => item.id === id) || null
  if (kind === 'timetable_change') return timetableEntries(context).find((item) => item.id === id) || null
  return null
}

export function reminderConflictContext(todos, now = new Date(), excludeId = '') {
  const context = buildSchoolAIContext({ now, todos })
  if (!excludeId) return context
  return {
    ...context,
    reminders: context.reminders.filter((item) => item.id !== excludeId),
  }
}
