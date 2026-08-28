import * as engine from './s-hub-ai-engine.js'
import {
  clearSchoolAIReminderSources,
  rememberSchoolAIReminderSources,
} from './s-hub-reminder-source.js'

export const askSchoolHub = engine.askSchoolHub
export const reviewSchoolImportConflicts = engine.reviewSchoolImportConflicts
export const findReminderConflict = engine.findReminderConflict

export async function analyzeSchoolNotice(options = {}) {
  clearSchoolAIReminderSources()
  const result = await engine.analyzeSchoolNotice(options)
  rememberSchoolAIReminderSources(result?.items, options?.files, options?.text)
  return result
}

export async function answerAndAnalyzeSchoolAttachments(options = {}) {
  clearSchoolAIReminderSources()
  const result = await engine.answerAndAnalyzeSchoolAttachments(options)
  rememberSchoolAIReminderSources(result?.items, options?.files, options?.question)
  return result
}
