import * as engine from './s-hub-ai-engine.js'
import {
  groupSchoolAIImportItems,
  reviewKnownSchoolImportConflicts,
} from './s-hub-ai-import-guard.js'
import {
  clearSchoolAIReminderSources,
  rememberSchoolAIReminderSources,
} from './s-hub-reminder-source.js'

export const askSchoolHub = engine.askSchoolHub
export const findReminderConflict = engine.findReminderConflict

export async function reviewSchoolImportConflicts(items, context, now, options = {}) {
  const knownConflicts = reviewKnownSchoolImportConflicts(items, context)
  const remainingItems = (items || []).filter((item) => !knownConflicts[item?.id])
  const engineConflicts = remainingItems.length
    ? await engine.reviewSchoolImportConflicts(remainingItems, context, now, options)
    : {}
  return { ...engineConflicts, ...knownConflicts }
}

export async function analyzeSchoolNotice(options = {}) {
  clearSchoolAIReminderSources()
  const rawResult = await engine.analyzeSchoolNotice(options)
  const result = {
    ...rawResult,
    items: groupSchoolAIImportItems(rawResult?.items),
  }
  rememberSchoolAIReminderSources(result?.items, options?.files, options?.text)
  return result
}

export async function answerAndAnalyzeSchoolAttachments(options = {}) {
  clearSchoolAIReminderSources()
  const rawResult = await engine.answerAndAnalyzeSchoolAttachments(options)
  const result = {
    ...rawResult,
    items: groupSchoolAIImportItems(rawResult?.items),
  }
  rememberSchoolAIReminderSources(result?.items, options?.files, options?.question)
  return result
}
