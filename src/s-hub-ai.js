import * as engine from './s-hub-ai-engine.js'
import { findDeterministicConflict } from './s-hub-ai-core.js'
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

  if (item.type === 'material') {
    return {
      overview: cleanText(item.title, 300) || '준비물 내용을 원문에서 확인해줘.',
      sections: [],
    }
  }

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
      const conflict = findDeterministicConflict(item, context)
      if (conflict) conflicts[item.id] = conflict
    } catch (error) {
      console.warn('S-Hub deterministic conflict guard unavailable for item:', item?.id, error)
    }
  }
  return conflicts
}

function removeKnownDuplicates(items, context) {
  const source = Array.isArray(items) ? items : []
  const conflicts = localConflictMap(source, context)
  const skippedDuplicates = []
  const kept = source.filter((item) => {
    const conflict = conflicts[item?.id]
    if (conflict?.relation !== 'duplicate') return true
    skippedDuplicates.push({ item, conflict })
    return false
  })
  return { items: kept, skippedDuplicates }
}

export const askSchoolHub = engine.askSchoolHub
export const findReminderConflict = engine.findReminderConflict

// Import review intentionally stays local. The source notice has already been interpreted
// by the model once; a second semantic-model pass adds latency and another failure point.
export async function reviewSchoolImportConflicts(items, context) {
  return localConflictMap(items, context)
}

export async function analyzeSchoolNotice(options = {}) {
  clearSchoolAIReminderSources()
  const rawResult = await engine.analyzeSchoolNotice(options)
  const groupedItems = groupSchoolAIImportItems(rawResult?.items)
  const summarizedItems = attachPreviewSummaries(groupedItems)
  const filtered = removeKnownDuplicates(
    summarizedItems,
    options?.conflictContext || options?.context || {},
  )
  const result = {
    ...rawResult,
    items: filtered.items,
    skippedDuplicates: filtered.skippedDuplicates,
  }
  rememberSchoolAIReminderSources(result.items, options?.files, options?.text)
  return result
}

export async function answerAndAnalyzeSchoolAttachments(options = {}) {
  clearSchoolAIReminderSources()
  const rawResult = await engine.answerAndAnalyzeSchoolAttachments(options)
  const groupedItems = groupSchoolAIImportItems(rawResult?.items)
  const summarizedItems = attachPreviewSummaries(groupedItems)
  const filtered = removeKnownDuplicates(
    summarizedItems,
    options?.conflictContext || options?.context || {},
  )
  const result = {
    ...rawResult,
    items: filtered.items,
    skippedDuplicates: filtered.skippedDuplicates,
  }
  rememberSchoolAIReminderSources(result.items, options?.files, options?.question)
  return result
}
