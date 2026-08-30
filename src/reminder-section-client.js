import { readStudentProfile, writeClassReminderCategory } from './school-sync.js'
import {
  normalizeReminderCategory,
  reminderFilterOptions,
  reminderSectionById,
} from './reminder-categories.js'

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

export async function saveReminderSectionChange({
  action,
  sectionId,
  label = '',
  color = '',
  categories = [],
}) {
  const profile = readStudentProfile()
  if (!profile) throw sectionError('reminder-section/profile-required', 'Student profile required')

  const current = reminderSectionById(sectionId, categories)
  if (!current) throw sectionError('reminder-section/not-found', 'Reminder section not found')
  const now = Date.now()

  if (action === 'delete') {
    if (visibleSections(categories).length <= 1) {
      throw sectionError('reminder-section/last-visible', 'Cannot hide the last reminder section')
    }
    const next = normalizeReminderCategory({
      id: current.id,
      label: current.label,
      color: current.color || '',
      hidden: true,
      createdAt: Number(current.createdAt || now),
      updatedAt: now,
    })
    if (!next) throw sectionError('reminder-section/invalid', 'Invalid reminder section')
    await writeClassReminderCategory(profile, next)
    return next
  }

  if (action !== 'update') throw sectionError('reminder-section/invalid-action', 'Invalid reminder section action')
  const nextLabel = normalizedLabel(label)
  const nextColor = String(color || '').trim().toLowerCase()
  if (!nextLabel) throw sectionError('reminder-section/invalid-label', 'Reminder section label required')
  if (current.id !== 'all' && !nextColor) {
    throw sectionError('reminder-section/invalid-color', 'Reminder section color required')
  }
  validateUniqueSection(current.id, nextLabel, nextColor, categories)

  const next = normalizeReminderCategory({
    id: current.id,
    label: nextLabel,
    color: nextColor,
    hidden: false,
    createdAt: Number(current.createdAt || now),
    updatedAt: now,
  })
  if (!next) throw sectionError('reminder-section/invalid', 'Invalid reminder section')
  await writeClassReminderCategory(profile, next)
  return next
}
