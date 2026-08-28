import { TodoHomePreview, useTodos as useBaseTodos } from './todo.jsx'
import { TodoPage } from './todo-stage5-ai.jsx'
import { parseReminderWithAI } from './firebase-ai.js'
import { createPendingReminderSummary, withAttachmentManifest } from './reminder-summary.jsx'
import {
  claimSchoolAIReminderSource,
  completeSchoolAIReminderSource,
  releaseSchoolAIReminderSource,
} from './s-hub-reminder-source.js'
import { deleteExpiredSharedTodo, writeSharedTodo } from './school-sync'

export { TodoHomePreview, TodoPage }

function schoolAIImportSheetOpen() {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector(
    '.unified-school-sheet.s-hub-ai-sheet.is-open, .unified-school-sheet.s-hub-ai-sheet.is-opening',
  ))
}

function reminderEnrichmentText(input, sourceText = '') {
  const title = String(input?.title || '').trim()
  const dueDate = String(input?.dueDate || '').trim()
  const dueTime = String(input?.dueTime || '').trim()
  const due = [dueDate, dueTime].filter(Boolean).join(' ')
  const focus = `리마인더: ${title}${due ? ` / 마감 ${due}` : ''}. 이 항목을 중심으로 첨부를 요약해.`
  const source = String(sourceText || '').trim()
  return `${focus}${source ? ` 참고: ${source}` : ''}`.slice(0, 140)
}

async function finishSchoolAIReminderEnrichment(todoData, todoId, input, source) {
  const files = Array.from(source?.files || []).filter((file) => file instanceof Blob).slice(0, 4)
  if (!todoId || !files.length) return

  const uploadResultsPromise = Promise.all(files.map(async (file, index) => {
    try {
      await todoData.uploadOriginalAttachment(todoId, file, `a${index}`)
      return true
    } catch (error) {
      console.error(`S-Hub reminder original attachment ${index + 1} save failed:`, error)
      return false
    }
  }))

  const promptText = reminderEnrichmentText(input, source?.text)
  let parsed = null
  try {
    parsed = await parseReminderWithAI(promptText, new Date(), files)
  } catch (error) {
    console.error('S-Hub reminder summary failed:', error)
  }

  if (!parsed?.summary && navigator.onLine !== false) {
    await new Promise((resolve) => window.setTimeout(resolve, 1600))
    try {
      parsed = await parseReminderWithAI(promptText, new Date(), files)
    } catch (error) {
      console.error('S-Hub reminder summary retry failed:', error)
    }
  }

  if (!parsed?.summary) {
    await uploadResultsPromise
    return
  }

  try {
    await todoData.enrichTodo(todoId, {
      summary: parsed.summary,
      attachment: parsed.attachment || null,
    })
  } catch (error) {
    console.error('S-Hub reminder summary save failed:', error)
    await uploadResultsPromise
    return
  }

  const uploadResults = await uploadResultsPromise
  if (!uploadResults.every(Boolean)) return

  try {
    await todoData.enrichTodo(todoId, {
      summary: withAttachmentManifest(parsed.summary, files),
      attachment: parsed.attachment || null,
    })
  } catch (error) {
    console.error('S-Hub reminder original manifest save failed:', error)
  }
}

export function useTodos(profile) {
  const todoData = useBaseTodos(profile)

  async function saveTodo(input) {
    const source = schoolAIImportSheetOpen() ? claimSchoolAIReminderSource() : null
    const sourceFiles = Array.from(source?.files || []).filter((file) => file instanceof Blob).slice(0, 4)
    const shouldShowPendingSummary = Boolean(sourceFiles.length && !input?.id && !input?.summary)
    const nextInput = shouldShowPendingSummary
      ? { ...input, summary: createPendingReminderSummary(sourceFiles) }
      : input

    try {
      const savedId = await todoData.saveTodo(nextInput)
      if (!savedId) {
        if (source?.claimId) releaseSchoolAIReminderSource(source.claimId)
        return ''
      }

      if (source?.claimId) {
        completeSchoolAIReminderSource(source.claimId)
        void finishSchoolAIReminderEnrichment(todoData, savedId, input, source)
      }
      return savedId
    } catch (error) {
      if (source?.claimId) releaseSchoolAIReminderSource(source.claimId)
      throw error
    }
  }

  function removeTodo(id) {
    const target = todoData.todos.find((todo) => todo.id === id)
    if (!target) return

    // Completed-item deletion stays personal to this student.
    if (target.completed) {
      todoData.removeTodo(id)
      return
    }

    // Deleting an active reminder from Edit is a class-wide deletion.
    // First move the shared document to an already-expired date so every
    // class client hides it immediately under the existing expiry logic.
    // Then physically delete the shared document when the current rules allow it.
    const tombstone = {
      ...target,
      dueDate: '1970-01-01',
      dueTime: '',
      updatedAt: Date.now(),
    }

    void writeSharedTodo(profile, tombstone)
      .then(() => deleteExpiredSharedTodo(profile, id))
      .catch((error) => {
        console.error('Class-wide reminder delete failed:', error)
      })
  }

  return {
    ...todoData,
    saveTodo,
    removeTodo,
  }
}
