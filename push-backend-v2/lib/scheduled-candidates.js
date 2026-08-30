import {
  isImportantAcademic,
  isNightPreviewWindow,
  isReminderHourDue,
  kstDateKey,
  tomorrowDateKey,
  validTime,
} from './schedule-logic.js'

const HOUR_MS = 60 * 60 * 1000

export function candidateDateKeys(checkpoints = []) {
  const todoDates = new Set()
  const academicDates = new Set()

  for (const checkpoint of checkpoints || []) {
    const nowMs = Number(checkpoint)
    if (!Number.isFinite(nowMs)) continue

    todoDates.add(kstDateKey(nowMs + HOUR_MS))

    if (isNightPreviewWindow(nowMs)) {
      const tomorrow = tomorrowDateKey(nowMs)
      if (tomorrow) {
        todoDates.add(tomorrow)
        academicDates.add(tomorrow)
      }
    }
  }

  return {
    todoDates: [...todoDates].filter(Boolean),
    academicDates: [...academicDates].filter(Boolean),
  }
}

export function todoRelevantForCheckpoints(todo, checkpoints = []) {
  if (!todo || typeof todo !== 'object') return false

  for (const checkpoint of checkpoints || []) {
    const nowMs = Number(checkpoint)
    if (!Number.isFinite(nowMs)) continue

    if (isReminderHourDue(todo, nowMs)) return true

    if (
      !validTime(todo.dueTime)
      && isNightPreviewWindow(nowMs)
      && String(todo.dueDate || '') === tomorrowDateKey(nowMs)
    ) {
      return true
    }
  }

  return false
}

export function academicRelevantForCheckpoints(event, checkpoints = []) {
  if (!event || typeof event !== 'object' || !isImportantAcademic(event)) return false

  for (const checkpoint of checkpoints || []) {
    const nowMs = Number(checkpoint)
    if (!Number.isFinite(nowMs)) continue
    if (!isNightPreviewWindow(nowMs)) continue
    if (String(event.startDate || '') === tomorrowDateKey(nowMs)) return true
  }

  return false
}

export function classDocumentFromSnapshot(snapshot, collectionName) {
  const parts = String(snapshot?.ref?.path || '').split('/')
  if (
    parts.length !== 4
    || parts[0] !== 'classes'
    || parts[2] !== collectionName
    || !parts[1]
  ) {
    return null
  }

  return {
    classId: parts[1],
    value: {
      id: String(snapshot.id || parts[3] || ''),
      ...(snapshot.data?.() || {}),
    },
  }
}