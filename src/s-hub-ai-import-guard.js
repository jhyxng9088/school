import { compactSchoolTitle, titleSimilarity } from './s-hub-ai-core.js'

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 }
const EXAM_FAMILIES = [
  ['mock_exam', /모의고사|모의평가|전국연합(?:학력평가)?|학력평가|평가원(?:\s*모의)?/i],
  ['csat', /수능|대학수학능력시험/i],
  ['midterm', /중간고사|중간시험|1차\s*(?:지필|고사|시험)/i],
  ['final', /기말고사|기말시험|2차\s*(?:지필|고사|시험)/i],
]

function clampText(value, maxLength = 80) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function weakestConfidence(items) {
  return items.reduce((current, item) => {
    const next = ['low', 'medium', 'high'].includes(item?.confidence) ? item.confidence : 'low'
    return CONFIDENCE_RANK[next] < CONFIDENCE_RANK[current] ? next : current
  }, 'high')
}

function materialLabel(title) {
  const original = clampText(title, 80)
  if (!original) return ''
  const cleaned = original
    .replace(/(?:준비물|지참물)\s*[:：-]?\s*/gi, '')
    .replace(/\s*(?:가져오기|가져오기|챙기기|준비하기|준비|지참하기|지참|가져올\s*것)\s*$/gi, '')
    .replace(/^[,·•ㆍ\s]+|[,·•ㆍ\s]+$/g, '')
    .trim()
  return cleaned || original
}

function mergeMaterialGroup(group) {
  const first = group[0]
  const seen = new Set()
  const labels = []
  group.forEach((item) => {
    const label = materialLabel(item.title)
    const key = compactSchoolTitle(label)
    if (!label || !key || seen.has(key)) return
    seen.add(key)
    labels.push(label)
  })
  if (labels.length < 2) return first

  const joined = labels.join(', ')
  return {
    ...first,
    confidence: weakestConfidence(group),
    title: clampText(`준비물: ${joined}`, 80),
    reason: '같은 날짜의 준비물을 한 번에 챙길 수 있게 묶었어.',
  }
}

export function groupSchoolAIImportItems(items = []) {
  const source = Array.isArray(items) ? items : []
  const materialGroups = new Map()
  const passthrough = []
  const order = []

  source.forEach((item, index) => {
    const mergeable = item?.kind === 'reminder' && item?.type === 'material' && item?.valid !== false && item?.dueDate
    if (!mergeable) {
      passthrough.push({ index, item })
      return
    }
    const key = `${item.dueDate}|${item.dueTime || ''}`
    if (!materialGroups.has(key)) {
      materialGroups.set(key, [])
      order.push({ index, key })
    }
    materialGroups.get(key).push(item)
  })

  const merged = order.map(({ index, key }) => ({
    index,
    item: mergeMaterialGroup(materialGroups.get(key)),
  }))

  return [...passthrough, ...merged]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.item)
    .slice(0, 10)
}

function examFamily(title) {
  const text = clampText(title, 120)
  return EXAM_FAMILIES.find(([, pattern]) => pattern.test(text))?.[0] || ''
}

function dateInside(date, startDate, endDate = startDate) {
  return Boolean(date && startDate && endDate && date >= startDate && date <= endDate)
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false
  return firstStart <= secondEnd && secondStart <= firstEnd
}

function sameExamMeaning(firstTitle, secondTitle) {
  const firstFamily = examFamily(firstTitle)
  const secondFamily = examFamily(secondTitle)
  if (firstFamily && firstFamily === secondFamily) return true
  return titleSimilarity(firstTitle, secondTitle) >= 0.62
}

function conflictResult(item, existing, existingKind, reason) {
  return {
    candidateId: item.id,
    relation: 'duplicate',
    existingKind,
    existingId: existing.id,
    existing,
    reason,
    source: 'local',
    confidence: 'high',
  }
}

function reminderExamAcademicConflict(item, context) {
  if (item?.kind !== 'reminder' || item?.type !== 'exam' || !item?.dueDate) return null
  for (const existing of context?.academic || []) {
    if (!dateInside(item.dueDate, existing.startDate, existing.endDate)) continue
    if (!sameExamMeaning(item.title, existing.title)) continue
    return conflictResult(item, existing, 'academic', '같은 시험 일정이 학사일정에 이미 있어.')
  }
  return null
}

function academicAcademicConflict(item, context) {
  if (item?.kind !== 'academic' || !item?.startDate || !item?.endDate) return null
  for (const existing of context?.academic || []) {
    if (existing.id === item.id) continue
    if (!rangesOverlap(item.startDate, item.endDate, existing.startDate, existing.endDate)) continue
    if (!sameExamMeaning(item.title, existing.title)) continue
    return conflictResult(item, existing, 'academic', '같은 시험 학사일정이 이미 있어.')
  }
  return null
}

function academicReminderExamConflict(item, context) {
  if (item?.kind !== 'academic' || !item?.startDate || !item?.endDate) return null
  for (const existing of context?.reminders || []) {
    if (existing.type !== 'exam') continue
    if (!dateInside(existing.dueDate, item.startDate, item.endDate)) continue
    if (!sameExamMeaning(item.title, existing.title)) continue
    return conflictResult(item, existing, 'reminder', '같은 시험 일정이 리마인더에 이미 있어.')
  }
  return null
}

export function reviewKnownSchoolImportConflicts(items = [], context = {}) {
  const result = {}
  for (const item of items || []) {
    if (!item?.id || item.valid === false) continue
    const conflict = reminderExamAcademicConflict(item, context)
      || academicAcademicConflict(item, context)
      || academicReminderExamConflict(item, context)
    if (conflict) result[item.id] = conflict
  }
  return result
}
