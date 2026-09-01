import { classKeyFor, ensureSignedIn, readStudentProfile } from './school-sync.js'
import {
  normalizeReminderCategories,
  normalizeReminderCategory,
  reminderFilterOptions,
  reminderSectionById,
} from './reminder-categories.js'

const REMINDER_SECTION_API_URL = 'https://school-reminder-backend.vercel.app/api/reminder-sections'
const REMINDER_CATEGORIES_CACHE_VERSION = 'v1'
const PENDING_SECTION_QUEUE_VERSION = 'v1'
const PENDING_SECTION_RETRY_MS = 30 * 60 * 1000

function sectionError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizedLabel(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 16)
}

function visibleSections(categories) {
  return reminderFilterOptions(categories)
}

function validateUniqueSection(sectionId, label, color, categories) {
  const comparableLabel = label.toLocaleLowerCase('ko')
  const visible = visibleSections(categories).filter((item) => item.id !== sectionId)
  if (visible.some((item) => String(item.label || '').toLocaleLowerCase('ko') === comparableLabel)) {
    throw sectionError('reminder-section/duplicate-label', 'Duplicate reminder section label')
  }
  if (color && visible.some((item) => item.color === color)) {
    throw sectionError('reminder-section/duplicate-color', 'Duplicate reminder section color')
  }
}

function currentProfile() {
  try {
    return readStudentProfile()
  } catch {
    return null
  }
}

function scopedStorageKey(prefix, profile = currentProfile()) {
  const classKey = classKeyFor(profile)
  return classKey ? `${prefix}.${classKey}` : ''
}

function pendingQueueKey(profile) {
  return scopedStorageKey(`school.reminderSection.pending.${PENDING_SECTION_QUEUE_VERSION}`, profile)
}

function pendingAttemptKey(profile) {
  return scopedStorageKey(`school.reminderSection.pendingAttempt.${PENDING_SECTION_QUEUE_VERSION}`, profile)
}

function reminderCategoriesCacheKey(profile) {
  const classKey = classKeyFor(profile)
  return classKey ? `school.reminderCategories.${REMINDER_CATEGORIES_CACHE_VERSION}.${classKey}` : ''
}

function readPendingQueue(profile = currentProfile()) {
  const key = pendingQueueKey(profile)
  if (!key || typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value)
      ? value.filter((item) => item && item.action === 'update' && item.sectionId)
      : []
  } catch {
    return []
  }
}

function writePendingQueue(profile, queue) {
  const key = pendingQueueKey(profile)
  if (!key || typeof localStorage === 'undefined') return false
  try {
    if (queue.length) localStorage.setItem(key, JSON.stringify(queue))
    else localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function writeLastPendingAttempt(profile, value = Date.now()) {
  const key = pendingAttemptKey(profile)
  if (!key || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Retry throttling is best-effort.
  }
}

function readLastPendingAttempt(profile) {
  const key = pendingAttemptKey(profile)
  if (!key || typeof localStorage === 'undefined') return 0
  try {
    return Number(localStorage.getItem(key) || 0)
  } catch {
    return 0
  }
}

function updateReminderCategoriesCache(profile, optimistic) {
  const key = reminderCategoriesCacheKey(profile)
  if (!key || typeof localStorage === 'undefined') return false
  try {
    const stored = normalizeReminderCategories(JSON.parse(localStorage.getItem(key) || '[]'))
    const next = normalizeReminderCategories([
      ...stored.filter((category) => category.id !== optimistic.id),
      optimistic,
    ])
    localStorage.setItem(key, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

function queuePendingSectionUpdate(payload, optimistic) {
  const profile = currentProfile()
  if (!profile) return false

  const queue = readPendingQueue(profile)
    .filter((item) => item.sectionId !== payload.sectionId)

  queue.push({
    action: 'update',
    sectionId: payload.sectionId,
    label: payload.label,
    color: payload.color,
    queuedAt: Date.now(),
  })

  const queued = writePendingQueue(profile, queue)
  const cached = updateReminderCategoriesCache(profile, optimistic)
  if (!queued || !cached) return false

  writeLastPendingAttempt(profile)
  return true
}

function queueableUpdateError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return (
    code === '8'
    || code === 'RESOURCE_EXHAUSTED'
    || code === 'reminder-section/quota-exhausted'
    || /resource[_ -]?exhausted|quota exceeded/i.test(`${code} ${message}`)
  )
}

async function postSectionChange(url, payload, idToken) {
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return {
      response: null,
      body: {},
      networkError: true,
    }
  }

  const body = await response.json().catch(() => ({}))
  return { response, body, networkError: false }
}

async function requestSectionChange(payload) {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw sectionError('reminder-section/auth-required', 'Authentication required')

  const result = await postSectionChange(REMINDER_SECTION_API_URL, payload, idToken)
  if (result.networkError || !result.response) {
    throw sectionError('reminder-section/network', 'Reminder section server unavailable')
  }

  if (!result.response.ok || result.body?.ok !== true) {
    const code = String(result.body?.error || 'reminder-section/server')
    if (code === '8' || /resource[_ -]?exhausted|quota/i.test(code)) {
      throw sectionError('reminder-section/quota-exhausted', 'Firestore quota exceeded')
    }
    throw sectionError(
      code,
      String(result.body?.message || 'Reminder section save failed'),
    )
  }
  return result.body.data || {}
}

export async function flushPendingReminderSectionChanges({ force = false } = {}) {
  const profile = currentProfile()
  if (!profile) return { flushed: 0, pending: 0 }

  const queue = readPendingQueue(profile)
  if (!queue.length) return { flushed: 0, pending: 0 }

  const now = Date.now()
  const lastAttempt = readLastPendingAttempt(profile)
  if (!force && now - lastAttempt < PENDING_SECTION_RETRY_MS) {
    return { flushed: 0, pending: queue.length }
  }

  writeLastPendingAttempt(profile, now)
  const remaining = [...queue]
  let flushed = 0

  while (remaining.length) {
    const item = remaining[0]
    try {
      await requestSectionChange({
        action: 'update',
        sectionId: item.sectionId,
        label: item.label,
        color: item.color,
      })
      remaining.shift()
      flushed += 1
      writePendingQueue(profile, remaining)
    } catch {
      break
    }
  }

  return { flushed, pending: remaining.length }
}

function installPendingSectionRetry() {
  if (typeof window === 'undefined') return
  const retry = () => {
    void flushPendingReminderSectionChanges().catch(() => {})
  }
  window.setTimeout(retry, 12_000)
  window.setInterval(retry, PENDING_SECTION_RETRY_MS)
  window.addEventListener('online', () => {
    void flushPendingReminderSectionChanges({ force: true }).catch(() => {})
  })
}

installPendingSectionRetry()

export async function saveReminderSectionChange({
  action,
  sectionId,
  label = '',
  color = '',
  categories = [],
}) {
  const current = reminderSectionById(sectionId, categories)
  if (!current) throw sectionError('reminder-section/not-found', 'Reminder section not found')

  if (action === 'delete') {
    if (visibleSections(categories).length <= 1) {
      throw sectionError('reminder-section/last-visible', 'Cannot hide the last reminder section')
    }
    return requestSectionChange({ action: 'delete', sectionId: current.id })
  }

  if (action === 'restore') {
    if (!current.hidden || !['all', 'task', 'performance', 'exam', 'material'].includes(current.id)) {
      throw sectionError('reminder-section/not-restorable', 'Reminder section cannot be restored')
    }
    const nextLabel = normalizedLabel(label || current.label)
    const nextColor = String(color || current.color || '').trim().toLowerCase()
    if (!nextLabel) throw sectionError('reminder-section/invalid-label', 'Reminder section label required')
    if (current.id !== 'all' && !nextColor) {
      throw sectionError('reminder-section/invalid-color', 'Reminder section color required')
    }
    validateUniqueSection(current.id, nextLabel, nextColor, categories)
    return requestSectionChange({
      action: 'restore',
      sectionId: current.id,
      label: nextLabel,
      color: nextColor,
    })
  }

  if (action !== 'update') throw sectionError('reminder-section/invalid-action', 'Invalid reminder section action')
  const nextLabel = normalizedLabel(label)
  const nextColor = String(color || '').trim().toLowerCase()
  if (!nextLabel) throw sectionError('reminder-section/invalid-label', 'Reminder section label required')
  if (current.id !== 'all' && !nextColor) {
    throw sectionError('reminder-section/invalid-color', 'Reminder section color required')
  }
  validateUniqueSection(current.id, nextLabel, nextColor, categories)

  const optimistic = normalizeReminderCategory({
    id: current.id,
    label: nextLabel,
    color: nextColor,
    hidden: false,
    createdAt: Number(current.createdAt || Date.now()),
    updatedAt: Date.now(),
  })
  if (!optimistic) throw sectionError('reminder-section/invalid', 'Invalid reminder section')

  const payload = {
    action: 'update',
    sectionId: current.id,
    label: nextLabel,
    color: nextColor,
  }

  try {
    return await requestSectionChange(payload)
  } catch (error) {
    if (!queueableUpdateError(error) || !queuePendingSectionUpdate(payload, optimistic)) throw error

    return {
      section: optimistic,
      pendingSync: true,
    }
  }
}
