export const TODO_TYPES = [
  { id: 'task', label: '일반', color: '#90939a' },
  { id: 'performance', label: '수행평가', color: '#7c83ff' },
  { id: 'exam', label: '시험', color: '#ef6b66' },
  { id: 'material', label: '준비물', color: '#56a781' },
]

export const REMINDER_ALL_SECTION = { id: 'all', label: '전체', color: '' }

export const REMINDER_CATEGORY_COLORS = [
  { id: '#90939a', label: '회색' },
  { id: '#7c83ff', label: '보라 파랑' },
  { id: '#ef6b66', label: '코랄' },
  { id: '#56a781', label: '초록' },
  { id: '#d68a45', label: '주황' },
  { id: '#3f91c7', label: '파랑' },
  { id: '#9b6fd0', label: '보라' },
  { id: '#d85b91', label: '분홍' },
  { id: '#38a6a6', label: '청록' },
  { id: '#a77851', label: '갈색' },
  { id: '#78a947', label: '연두' },
  { id: '#b8615c', label: '벽돌색' },
]

export const CUSTOM_REMINDER_CATEGORY_COLORS = REMINDER_CATEGORY_COLORS.filter(
  (color) => !TODO_TYPES.some((type) => type.color === color.id),
)

const BUILTIN_IDS = new Set(TODO_TYPES.map((type) => type.id))
const CATEGORY_COLORS = new Set(REMINDER_CATEGORY_COLORS.map((color) => color.id))
const CUSTOM_ID_PATTERN = /^custom-[0-9a-f]{6}$/

function randomCategoryHex() {
  const bytes = new Uint8Array(3)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  }
  const seed = `${Date.now()}-${Math.random()}`
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-6)
}

export function createReminderCategoryId() {
  return `custom-${randomCategoryHex()}`
}

export function isReminderTypeId(value) {
  const id = String(value || '').trim()
  return BUILTIN_IDS.has(id) || CUSTOM_ID_PATTERN.test(id)
}

export function isReminderSectionId(value) {
  const id = String(value || '').trim()
  return id === 'all' || BUILTIN_IDS.has(id) || CUSTOM_ID_PATTERN.test(id)
}

export function normalizeReminderCategory(value) {
  if (!value || typeof value !== 'object') return null
  const color = String(value.color || '').trim().toLowerCase()
  const id = String(value.id || '').trim().toLowerCase()
  const label = String(value.label || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 16)
  if (!isReminderSectionId(id) || !label) return null
  if (id === 'all') {
    if (color && !CATEGORY_COLORS.has(color)) return null
  } else if (!CATEGORY_COLORS.has(color)) {
    return null
  }

  const category = {
    id,
    label,
    color,
    createdAt: Number(value.createdAt || Date.now()),
    updatedAt: Number(value.updatedAt || value.createdAt || Date.now()),
  }
  if (Object.prototype.hasOwnProperty.call(value, 'hidden')) category.hidden = Boolean(value.hidden)
  return category
}

export function normalizeReminderCategories(values) {
  const byId = new Map()
  if (!Array.isArray(values)) return []
  values.forEach((value) => {
    const category = normalizeReminderCategory(value)
    if (category) byId.set(category.id, category)
  })
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || a.label.localeCompare(b.label, 'ko'))
}

function normalizedCategoryMap(categories = []) {
  return new Map(normalizeReminderCategories(categories).map((category) => [category.id, category]))
}

function visibleSection(section, includeHidden) {
  return includeHidden || !Boolean(section?.hidden)
}

export function reminderTypeOptions(categories = [], { includeHidden = false } = {}) {
  const byId = normalizedCategoryMap(categories)
  const builtins = TODO_TYPES.map((type) => {
    const override = byId.get(type.id)
    return override ? { ...type, ...override, id: type.id } : { ...type }
  }).filter((type) => visibleSection(type, includeHidden))

  const custom = normalizeReminderCategories(categories)
    .filter((category) => CUSTOM_ID_PATTERN.test(category.id))
    .filter((category) => visibleSection(category, includeHidden))

  return [...builtins, ...custom]
}

export function reminderFilterOptions(categories = [], { includeHidden = false } = {}) {
  const byId = normalizedCategoryMap(categories)
  const allOverride = byId.get('all')
  const all = allOverride ? { ...REMINDER_ALL_SECTION, ...allOverride, id: 'all' } : { ...REMINDER_ALL_SECTION }
  const filters = visibleSection(all, includeHidden) ? [all] : []
  return [...filters, ...reminderTypeOptions(categories, { includeHidden })]
}

export function reminderSectionById(sectionId, categories = []) {
  const id = String(sectionId || '').trim()
  return reminderFilterOptions(categories, { includeHidden: true }).find((section) => section.id === id) || null
}

export function reminderTypeLabel(typeId, categories = []) {
  return reminderTypeOptions(categories, { includeHidden: true }).find((type) => type.id === typeId)?.label || '일반'
}

export function reminderTypeColor(typeId, categories = []) {
  return reminderTypeOptions(categories, { includeHidden: true }).find((type) => type.id === typeId)?.color || TODO_TYPES[0].color
}

export function usedReminderCategoryColors(categories = []) {
  return new Set(reminderFilterOptions(categories).map((section) => section.color).filter(Boolean))
}
