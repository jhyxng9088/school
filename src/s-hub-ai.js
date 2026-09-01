import * as engine from './s-hub-ai-engine.js'
import { compactSchoolTitle, findDeterministicConflict, titleSimilarity } from './s-hub-ai-core.js'
import {
  groupSchoolAIImportItems,
  reviewKnownSchoolImportConflicts,
} from './s-hub-ai-import-guard.js'
import {
  clearSchoolAIReminderSources,
  rememberSchoolAIReminderSources,
} from './s-hub-reminder-source.js'

function cleanText(value, maxLength = 700) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function previewSummaryFromAnalysis(item) {
  if (!item || item.kind !== 'reminder') return null
  const materialItems = Array.isArray(item.materialItems)
    ? item.materialItems.map((value) => cleanText(value, 120)).filter(Boolean).slice(0, 12)
    : []

  if (item.type === 'material' && materialItems.length) {
    return {
      overview: `준비물: ${materialItems.join(', ')}`,
      sections: [{ heading: '준비물 목록', items: materialItems }],
    }
  }

  const detail = cleanText(item.detail || item.reason, 700)
  if (detail) return { overview: detail, sections: [] }

  return {
    overview: cleanText(item.title, 300) || '세부 내용을 원문에서 확인해줘.',
    sections: [],
  }
}

function attachPreviewSummaries(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const previewSummary = previewSummaryFromAnalysis(item)
    return previewSummary ? { ...item, previewSummary } : item
  })
}

function analysisFingerprint(item) {
  if (!item || item.valid === false) return ''
  if (item.kind === 'reminder') {
    return `reminder|${compactSchoolTitle(item.title)}|${item.dueDate || ''}|${item.dueTime || ''}`
  }
  if (item.kind === 'timetable_change') {
    return `timetable|${item.date || ''}|${Number(item.period) || 0}|${compactSchoolTitle(item.subject)}`
  }
  if (item.kind === 'academic') {
    return `academic|${compactSchoolTitle(item.title)}|${item.startDate || ''}|${item.endDate || ''}`
  }
  return ''
}

function dedupeAnalysisItems(items) {
  const seen = new Set()
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = analysisFingerprint(item)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sameReminderMeaning(item, existing) {
  if (!item || !existing || item.kind !== 'reminder') return false
  if (item.dueDate !== existing.dueDate) return false
  if (item.dueTime && existing.dueTime && item.dueTime !== existing.dueTime) return false
  const first = compactSchoolTitle(item.title)
  const second = compactSchoolTitle(existing.title)
  if (!first || !second) return false
  if (first === second) return true
  if (item.type && existing.type && item.type !== existing.type) return false
  if (titleSimilarity(item.title, existing.title) >= 0.72) return true
  const shorter = first.length <= second.length ? first : second
  const longer = first.length > second.length ? first : second
  return shorter.length >= 5 && longer.includes(shorter) && shorter.length / longer.length >= 0.72
}

function reminderDuplicateConflict(item, context) {
  if (item?.kind !== 'reminder') return null
  const reminders = Array.isArray(context?.reminders) ? context.reminders : []
  const existing = reminders.find((candidate) => candidate?.id !== item.id && sameReminderMeaning(item, candidate))
  if (!existing) return null
  return {
    candidateId: item.id,
    relation: 'duplicate',
    existingKind: 'reminder',
    existingId: existing.id,
    existing,
    reason: '같은 리마인더가 이미 있어.',
    source: 'local',
    confidence: 'high',
  }
}

function localConflictMap(items, context) {
  const validItems = Array.isArray(items) ? items.filter((item) => item?.valid !== false) : []
  let known = {}
  try {
    known = reviewKnownSchoolImportConflicts(validItems, context) || {}
  } catch (error) {
    console.warn('S-Hub known conflict guard unavailable:', error)
  }

  const conflicts = { ...known }
  for (const item of validItems) {
    if (!item?.id || conflicts[item.id]) continue
    try {
      const conflict = reminderDuplicateConflict(item, context) || findDeterministicConflict(item, context)
      if (conflict) conflicts[item.id] = conflict
    } catch (error) {
      console.warn('S-Hub deterministic conflict guard unavailable for item:', item?.id, error)
    }
  }
  return conflicts
}

function shouldAutoSkip(item, conflict) {
  if (!conflict) return false
  if (conflict.relation === 'duplicate') return true
  return item?.kind === 'timetable_change'
    && conflict.relation === 'conflict'
    && Boolean(conflict?.existing?.isOverride)
}

function removeKnownExistingItems(items, context) {
  const source = dedupeAnalysisItems(items)
  const conflicts = localConflictMap(source, context)
  const skippedExisting = []
  const kept = source.filter((item) => {
    const conflict = conflicts[item?.id]
    if (!shouldAutoSkip(item, conflict)) return true
    skippedExisting.push({ item, conflict })
    return false
  })
  return { items: kept, skippedExisting }
}

export const askSchoolHub = engine.askSchoolHub
export const findReminderConflict = engine.findReminderConflict

// Existing-data review is intentionally local. The source notice has already been
// interpreted once; another model pass adds latency and another failure point.
export async function reviewSchoolImportConflicts(items, context) {
  return localConflictMap(items, context)
}

export async function analyzeSchoolNotice(options = {}) {
  clearSchoolAIReminderSources()
  const rawResult = await engine.analyzeSchoolNotice(options)
  const groupedItems = groupSchoolAIImportItems(rawResult?.items)
  const summarizedItems = attachPreviewSummaries(groupedItems)
  const filtered = removeKnownExistingItems(
    summarizedItems,
    options?.conflictContext || options?.context || {},
  )
  const result = {
    ...rawResult,
    items: filtered.items,
    skippedExisting: filtered.skippedExisting,
  }
  rememberSchoolAIReminderSources(result.items, options?.files, options?.text)
  return result
}

export async function answerAndAnalyzeSchoolAttachments(options = {}) {
  clearSchoolAIReminderSources()
  const rawResult = await engine.answerAndAnalyzeSchoolAttachments(options)
  const groupedItems = groupSchoolAIImportItems(rawResult?.items)
  const summarizedItems = attachPreviewSummaries(groupedItems)
  const filtered = removeKnownExistingItems(
    summarizedItems,
    options?.conflictContext || options?.context || {},
  )
  const result = {
    ...rawResult,
    items: filtered.items,
    skippedExisting: filtered.skippedExisting,
  }
  rememberSchoolAIReminderSources(result.items, options?.files, options?.question)
  return result
}
