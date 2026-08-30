import * as engine from './s-hub-ai-engine.js'
import {
  clearSchoolAIReminderSources,
  rememberSchoolAIReminderSources,
} from './s-hub-reminder-source.js'
import { enrichPreviewAIContext } from './preview-v2-ai-context.js'

export async function askSchoolHub(options = {}) {
  const context = await enrichPreviewAIContext(options?.context || {})
  return engine.askSchoolHub({ ...options, context })
}

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
  const context = await enrichPreviewAIContext(options?.context || {})
  const result = await engine.answerAndAnalyzeSchoolAttachments({ ...options, context })
  rememberSchoolAIReminderSources(result?.items, options?.files, options?.question)
  return result
}
