import { ensureSignedIn } from './school-sync.js'
import {
  normalizeReminderCategory,
  reminderFilterOptions,
  reminderSectionById,
} from './reminder-categories.js'

const REMINDER_SECTION_API_URL = 'https://school-reminder-backend.vercel.app/api/reminder-sections'

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

async function requestSectionChange(payload) {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw sectionError('reminder-section/auth-required', 'Authentication required')

  let response
  try {
    response = await fetch(REMINDER_SECTION_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw sectionError('reminder-section/network', 'Reminder section server unavailable')
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    throw sectionError(
      String(body?.error || 'reminder-section/server'),
      String(body?.message || 'Reminder section save failed'),
    )
  }
  return body.data || {}
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