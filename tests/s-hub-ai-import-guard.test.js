import test from 'node:test'
import assert from 'node:assert/strict'
import {
  groupSchoolAIImportItems,
  reviewKnownSchoolImportConflicts,
} from '../src/s-hub-ai-import-guard.js'

test('groups same-date material reminders into one reminder', () => {
  const items = groupSchoolAIImportItems([
    { id: 'm1', kind: 'reminder', type: 'material', title: '컴퍼스 가져오기', dueDate: '2026-09-02', dueTime: '', confidence: 'high', valid: true },
    { id: 'm2', kind: 'reminder', type: 'material', title: '자 챙기기', dueDate: '2026-09-02', dueTime: '', confidence: 'high', valid: true },
    { id: 'm3', kind: 'reminder', type: 'material', title: '연필 지참', dueDate: '2026-09-02', dueTime: '', confidence: 'medium', valid: true },
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'm1')
  assert.equal(items[0].title, '준비물: 컴퍼스, 자, 연필')
  assert.equal(items[0].confidence, 'medium')
})

test('does not merge materials with different dates', () => {
  const items = groupSchoolAIImportItems([
    { id: 'm1', kind: 'reminder', type: 'material', title: '컴퍼스', dueDate: '2026-09-02', dueTime: '', confidence: 'high', valid: true },
    { id: 'm2', kind: 'reminder', type: 'material', title: '자', dueDate: '2026-09-03', dueTime: '', confidence: 'high', valid: true },
  ])

  assert.equal(items.length, 2)
})

test('treats same-date mock exam wording variants as duplicate academic events', () => {
  const items = [{
    id: 'candidate',
    kind: 'academic',
    title: '9월 모의고사',
    startDate: '2026-09-02',
    endDate: '2026-09-02',
    valid: true,
  }]
  const context = {
    academic: [{
      id: 'official-20260902',
      source: 'official',
      title: '전국연합학력평가',
      startDate: '2026-09-02',
      endDate: '2026-09-02',
    }],
    reminders: [],
  }

  const conflicts = reviewKnownSchoolImportConflicts(items, context)
  assert.equal(conflicts.candidate?.relation, 'duplicate')
  assert.equal(conflicts.candidate?.existingKind, 'academic')
})

test('catches a mock exam reminder when the same exam already exists in academic schedule', () => {
  const items = [{
    id: 'candidate',
    kind: 'reminder',
    type: 'exam',
    title: '모의고사',
    dueDate: '2026-09-02',
    dueTime: '',
    valid: true,
  }]
  const context = {
    academic: [{
      id: 'official-20260902',
      source: 'official',
      title: '전국연합학력평가',
      startDate: '2026-09-02',
      endDate: '2026-09-02',
    }],
    reminders: [],
  }

  const conflicts = reviewKnownSchoolImportConflicts(items, context)
  assert.equal(conflicts.candidate?.relation, 'duplicate')
  assert.equal(conflicts.candidate?.existingId, 'official-20260902')
})

test('does not collapse separate mock exams on different dates', () => {
  const items = [{
    id: 'candidate',
    kind: 'reminder',
    type: 'exam',
    title: '모의고사',
    dueDate: '2026-10-13',
    dueTime: '',
    valid: true,
  }]
  const context = {
    academic: [{
      id: 'official-20260902',
      source: 'official',
      title: '전국연합학력평가',
      startDate: '2026-09-02',
      endDate: '2026-09-02',
    }],
    reminders: [],
  }

  const conflicts = reviewKnownSchoolImportConflicts(items, context)
  assert.deepEqual(conflicts, {})
})
