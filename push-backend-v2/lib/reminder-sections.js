export const REMINDER_SECTION_DEFAULTS = [
  { id: 'all', label: '전체', color: '' },
  { id: 'task', label: '일반', color: '#90939a' },
  { id: 'performance', label: '수행평가', color: '#7c83ff' },
  { id: 'exam', label: '시험', color: '#ef6b66' },
  { id: 'material', label: '준비물', color: '#56a781' },
]

export const REMINDER_SECTION_COLORS = [
  '#90939a', '#7c83ff', '#ef6b66', '#56a781',
  '#d68a45', '#3f91c7', '#9b6fd0', '#d85b91',
  '#38a6a6', '#a77851', '#78a947', '#b8615c',
]

const BUILTIN_IDS = new Set(REMINDER_SECTION_DEFAULTS.map((section) => section.id))
const COLOR_IDS = new Set(REMINDER_SECTION_COLORS)
const CUSTOM_ID_PATTERN = /^custom-[0-9a-f]{6}$/

export class ReminderSectionError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function isCustomReminderSectionId(value) {
  return CUSTOM_ID_PATTERN.test(String(value || '').trim().toLowerCase())
}

export function isBuiltinReminderSectionId(value) {
  return BUILTIN_IDS.has(String(value || '').trim().toLowerCase())
}

export function isReminderSectionId(value) {
  const id = String(value || '').trim().toLowerCase()
  return BUILTIN_IDS.has(id) || CUSTOM_ID_PATTERN.test(id)
}

function normalizedLabel(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 16)
}

function normalizedColor(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeStoredSection(value) {
  if (!value || typeof value !== 'object') return null
  const id = String(value.id || '').trim().toLowerCase()
  const label = normalizedLabel(value.label)
  const color = normalizedColor(value.color)
  if (!isReminderSectionId(id) || !label) return null
  if (id === 'all') {
    if (color && !COLOR_IDS.has(color)) return null
  } else if (!COLOR_IDS.has(color)) {
    return null
  }
  return {
    id,
    label,
    color,
    hidden: Boolean(value.hidden),
    createdAt: Number(value.createdAt || 0),
    updatedAt: Number(value.updatedAt || value.createdAt || 0),
  }
}

function storedMap(documents = []) {
  const map = new Map()
  for (const value of Array.isArray(documents) ? documents : []) {
    const section = normalizeStoredSection(value)
    if (section) map.set(section.id, section)
  }
  return map
}

export function resolveReminderSections(documents = [], { includeHidden = false } = {}) {
  const byId = storedMap(documents)
  const defaults = REMINDER_SECTION_DEFAULTS.map((base) => {
    const override = byId.get(base.id)
    return override ? { ...base, ...override, id: base.id } : { ...base, hidden: false, createdAt: 0, updatedAt: 0 }
  })
  const custom = [...byId.values()]
    .filter((section) => isCustomReminderSectionId(section.id))
    .sort((a, b) => a.createdAt - b.createdAt || a.label.localeCompare(b.label, 'ko'))
  return [...defaults, ...custom].filter((section) => includeHidden || !section.hidden)
}

function currentSection(sectionId, documents, includeHidden = true) {
  const id = String(sectionId || '').trim().toLowerCase()
  return resolveReminderSections(documents, { includeHidden }).find((section) => section.id === id) || null
}

function ensureColor(sectionId, color) {
  if (sectionId === 'all') {
    if (color && !COLOR_IDS.has(color)) {
      throw new ReminderSectionError('reminder-section/invalid-color', 'Invalid reminder section color')
    }
    return
  }
  if (!COLOR_IDS.has(color)) {
    throw new ReminderSectionError('reminder-section/invalid-color', 'Invalid reminder section color')
  }
}

function validateVisibleUniqueness({ documents, sectionId, label, color }) {
  const visible = resolveReminderSections(documents).filter((section) => section.id !== sectionId)
  const comparable = label.toLocaleLowerCase('ko')
  if (visible.some((section) => section.label.toLocaleLowerCase('ko') === comparable)) {
    throw new ReminderSectionError('reminder-section/duplicate-label', 'Duplicate reminder section label')
  }
  if (color && visible.some((section) => section.color === color)) {
    throw new ReminderSectionError('reminder-section/duplicate-color', 'Duplicate reminder section color')
  }
}

export function prepareReminderSectionUpdate({
  documents = [],
  sectionId,
  label,
  color = '',
  now = Date.now(),
}) {
  const current = currentSection(sectionId, documents, true)
  if (!current || current.hidden) {
    throw new ReminderSectionError('reminder-section/not-found', 'Reminder section not found')
  }
  const nextLabel = normalizedLabel(label)
  const nextColor = normalizedColor(color)
  if (!nextLabel) throw new ReminderSectionError('reminder-section/invalid-label', 'Reminder section label required')
  ensureColor(current.id, nextColor)
  validateVisibleUniqueness({ documents, sectionId: current.id, label: nextLabel, color: nextColor })

  return {
    id: current.id,
    label: nextLabel,
    color: nextColor,
    hidden: false,
    createdAt: Number(current.createdAt || now),
    updatedAt: Number(now),
  }
}

export function prepareReminderSectionRestore({
  documents = [],
  sectionId,
  label,
  color = '',
  now = Date.now(),
}) {
  const current = currentSection(sectionId, documents, true)
  if (!current || !current.hidden || !isBuiltinReminderSectionId(current.id)) {
    throw new ReminderSectionError('reminder-section/not-restorable', 'Reminder section cannot be restored')
  }
  const nextLabel = normalizedLabel(label || current.label)
  const nextColor = normalizedColor(color || current.color)
  if (!nextLabel) throw new ReminderSectionError('reminder-section/invalid-label', 'Reminder section label required')
  ensureColor(current.id, nextColor)
  validateVisibleUniqueness({ documents, sectionId: current.id, label: nextLabel, color: nextColor })

  return {
    id: current.id,
    label: nextLabel,
    color: nextColor,
    hidden: false,
    createdAt: Number(current.createdAt || now),
    updatedAt: Number(now),
  }
}

export function prepareReminderSectionDelete({ documents = [], sectionId, now = Date.now() }) {
  const visible = resolveReminderSections(documents)
  const id = String(sectionId || '').trim().toLowerCase()
  const current = visible.find((section) => section.id === id)
  if (!current) throw new ReminderSectionError('reminder-section/not-found', 'Reminder section not found')
  if (visible.length <= 1) {
    throw new ReminderSectionError('reminder-section/last-visible', 'Cannot hide the last reminder section')
  }

  return {
    current,
    deleteDocument: isCustomReminderSectionId(id),
    migrateToGeneral: id !== 'all' && id !== 'task',
    document: isCustomReminderSectionId(id) ? null : {
      id: current.id,
      label: current.label,
      color: current.color || '',
      hidden: true,
      createdAt: Number(current.createdAt || now),
      updatedAt: Number(now),
    },
  }
}