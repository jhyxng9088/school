export const TODO_TYPES = [
  { id: 'task', label: '일반', color: '#90939a' },
  { id: 'performance', label: '수행평가', color: '#7c83ff' },
  { id: 'exam', label: '시험', color: '#ef6b66' },
  { id: 'material', label: '준비물', color: '#56a781' },
]

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

const BUILTIN_IDS = new Set(TODO_TYPES.map((type) => type.id))
const CATEGORY_COLORS = new Set(REMINDER_CATEGORY_COLORS.map((color) => color.id))
const CUSTOM_ID_PATTERN = /^custom-[0-9a-f]{6}$/

export function createReminderCategoryId(color) {
  const normalizedColor = String(color || '').trim().toLowerCase()
  return CATEGORY_COLORS.has(normalizedColor) ? `custom-${normalizedColor.slice(1)}` : ''
}

export function isReminderTypeId(value) {
  const id = String(value || '').trim()
  return BUILTIN_IDS.has(id) || CUSTOM_ID_PATTERN.test(id)
}

export function normalizeReminderCategory(value) {
  if (!value || typeof value !== 'object') return null
  const color = String(value.color || '').trim().toLowerCase()
  const id = String(value.id || '').trim().toLowerCase()
  const label = String(value.label || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 16)
  if (!CUSTOM_ID_PATTERN.test(id) || id !== createReminderCategoryId(color) || !label) return null
  return {
    id,
    label,
    color,
    createdAt: Number(value.createdAt || Date.now()),
    updatedAt: Number(value.updatedAt || value.createdAt || Date.now()),
  }
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

export function reminderTypeOptions(categories = []) {
  return [...TODO_TYPES, ...normalizeReminderCategories(categories)]
}

export function reminderTypeLabel(typeId, categories = []) {
  return reminderTypeOptions(categories).find((type) => type.id === typeId)?.label || '일반'
}

export function reminderTypeColor(typeId, categories = []) {
  return reminderTypeOptions(categories).find((type) => type.id === typeId)?.color || TODO_TYPES[0].color
}

export function usedReminderCategoryColors(categories = []) {
  return new Set(reminderTypeOptions(categories).map((type) => type.color))
}
