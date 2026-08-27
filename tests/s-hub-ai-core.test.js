import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSchoolAIContext,
  findDeterministicConflict,
  normalizeImportItems,
  semanticConflictShortlist,
  titleSimilarity,
} from '../src/s-hub-ai-core.js'

const NOW = new Date(2026, 7, 27, 12, 0, 0, 0)

test('notice normalization keeps incomplete items visible but invalid', () => {
  const items = normalizeImportItems({
    items: [{
      id: 'a',
      kind: 'reminder',
      confidence: 'low',
      reason: '날짜를 찾지 못함',
      type: 'performance',
      title: '영어 발표 수행평가',
      dueDate: '',
      dueTime: '',
    }],
  }, NOW)

  assert.equal(items.length, 1)
  assert.equal(items[0].title, '영어 발표 수행평가')
  assert.equal(items[0].valid, false)
  assert.equal(items[0].dueDate, '')
})

test('school context excludes completed and expired reminders', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    todos: [
      { id: 'keep', type: 'task', title: '과학 보고서', dueDate: '2026-08-29', dueTime: '', completed: false },
      { id: 'done', type: 'task', title: '완료 항목', dueDate: '2026-08-29', completed: true },
      { id: 'past', type: 'task', title: '지난 항목', dueDate: '2026-08-26', completed: false },
    ],
  })

  assert.deepEqual(context.reminders.map((item) => item.id), ['keep'])
})

test('same reminder title and date is a deterministic duplicate', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    todos: [{ id: 'r1', type: 'performance', title: '수학 수행 발표', dueDate: '2026-09-04', dueTime: '', completed: false }],
  })
  const conflict = findDeterministicConflict({
    id: 'candidate', kind: 'reminder', type: 'performance', title: '수학 수행 발표', dueDate: '2026-09-04', dueTime: '', valid: true,
  }, context)

  assert.equal(conflict?.relation, 'duplicate')
  assert.equal(conflict?.existingId, 'r1')
})

test('same reminder title with a nearby different date is a deterministic conflict', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    todos: [{ id: 'r1', type: 'performance', title: '영어 수행평가', dueDate: '2026-09-03', dueTime: '', completed: false }],
  })
  const conflict = findDeterministicConflict({
    id: 'candidate', kind: 'reminder', type: 'performance', title: '영어 수행평가', dueDate: '2026-09-05', dueTime: '', valid: true,
  }, context)

  assert.equal(conflict?.relation, 'conflict')
  assert.equal(conflict?.existing?.dueDate, '2026-09-03')
})

test('same timetable slot detects duplicate or conflicting override correctly', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    timetableDays: [{
      date: '2026-08-28',
      periods: [{ number: 6, subject: '자습', baseSubject: '체육', isOverride: true, start: '14:00', end: '14:50' }],
    }],
  })

  const duplicate = findDeterministicConflict({
    id: 't1', kind: 'timetable_change', date: '2026-08-28', period: 6, subject: '자습', valid: true,
  }, context)
  const conflict = findDeterministicConflict({
    id: 't2', kind: 'timetable_change', date: '2026-08-28', period: 6, subject: '수학', valid: true,
  }, context)

  assert.equal(duplicate?.relation, 'duplicate')
  assert.equal(conflict?.relation, 'conflict')
})

test('a new timetable subject over an unchanged base period is not treated as an existing conflict', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    timetableDays: [{
      date: '2026-08-28',
      periods: [{ number: 6, subject: '체육', baseSubject: '체육', isOverride: false, start: '14:00', end: '14:50' }],
    }],
  })

  const conflict = findDeterministicConflict({
    id: 't1', kind: 'timetable_change', date: '2026-08-28', period: 6, subject: '자습', valid: true,
  }, context)
  assert.equal(conflict, null)
})

test('semantic shortlist only keeps plausible reminder matches', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    todos: [
      { id: 'near', type: 'performance', title: '수학 수행 발표', dueDate: '2026-09-04', completed: false },
      { id: 'far', type: 'material', title: '체육복 가져오기', dueDate: '2026-09-04', completed: false },
    ],
  })
  const shortlist = semanticConflictShortlist({
    id: 'candidate', kind: 'reminder', type: 'performance', title: '수학 발표 수행평가', dueDate: '2026-09-04', dueTime: '', valid: true,
  }, context)

  assert.equal(shortlist[0]?.id, 'near')
  assert.equal(shortlist.some((item) => item.id === 'far'), false)
  assert.ok(titleSimilarity('수학 수행 발표', '수학 발표 수행평가') > titleSimilarity('수학 수행 발표', '체육복 가져오기'))
})

test('academic schedule duplicate uses the existing custom event', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    customAcademicEvents: [{
      id: 'a1', title: '2학기 중간고사', startDate: '2026-09-28', endDate: '2026-10-01', important: true,
    }],
  })
  const conflict = findDeterministicConflict({
    id: 'candidate', kind: 'academic', title: '2학기 중간고사', startDate: '2026-09-28', endDate: '2026-10-01', valid: true,
  }, context)

  assert.equal(conflict?.relation, 'duplicate')
  assert.equal(conflict?.existing?.source, 'custom')
})

test('notice normalization caps a single analysis at ten items', () => {
  const items = normalizeImportItems({
    items: Array.from({ length: 14 }, (_, index) => ({
      id: `r-${index}`,
      kind: 'reminder',
      confidence: 'high',
      reason: '',
      type: 'task',
      title: `할 일 ${index}`,
      dueDate: '2026-09-01',
      dueTime: '',
    })),
  }, NOW)

  assert.equal(items.length, 10)
})
