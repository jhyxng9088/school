import { ensureSignedIn } from './school-sync.js'
import {
  normalizeReminderCategory,
  reminderFilterOptions,
  reminderSectionById,
} from './reminder-categories.js'

const REMINDER_SECTION_API_URL = 'https://school-reminder-backend.vercel.app/api/reminder-sections'
const REMINDER_SECTION_FALLBACK_API_URL = 'https://school-reminder-backend-mm1t9pzs6-jhyxng9088-7711.vercel.app/api/reminder-sections'

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

  let result = await postSectionChange(REMINDER_SECTION_API_URL, payload, idToken)
  const primaryNeedsFallback = (
    result.response?.status === 403
    && String(result.body?.error || '') === 'reminder-section/preview-class-required'
  )

  if (primaryNeedsFallback) {
    result = await postSectionChange(REMINDER_SECTION_FALLBACK_API_URL, payload, idToken)
  }

  if (result.networkError || !result.response) {
    throw sectionError('reminder-section/network', 'Reminder section server unavailable')
  }

  if (!result.response.ok || result.body?.ok !== true) {
    throw sectionError(
      String(result.body?.error || 'reminder-section/server'),
      String(result.body?.message || 'Reminder section save failed'),
    )
  }
  return result.body.data || {}
}

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

  return requestSectionChange({
    action: 'update',
    sectionId: current.id,
    label: nextLabel,
    color: nextColor,
  })
}
