import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ReminderSectionError,
  prepareReminderSectionDelete,
  prepareReminderSectionUpdate,
  resolveReminderSections,
} from '../lib/reminder-sections.js'

const custom = {
  id: 'custom-a1b2c3',
  label: '동아리',
  color: '#d68a45',
  createdAt: 10,
  updatedAt: 10,
}

test('built-in and custom sections resolve with per-class overrides', () => {
  const sections = resolveReminderSections([
    { id: 'task', label: '과제', color: '#3f91c7', hidden: false, createdAt: 1, updatedAt: 2 },
    custom,
  ])
  assert.equal(sections.find((section) => section.id === 'task').label, '과제')
  assert.equal(sections.find((section) => section.id === 'task').color, '#3f91c7')
  assert.equal(sections.find((section) => section.id === custom.id).label, '동아리')
})

test('section updates reject duplicate names and colors inside the same class', () => {
  assert.throws(() => prepareReminderSectionUpdate({
    documents: [custom],
    sectionId: 'exam',
    label: '동아리',
    color: '#9b6fd0',
    now: 20,
  }), (error) => error instanceof ReminderSectionError && error.code === 'reminder-section/duplicate-label')

  assert.throws(() => prepareReminderSectionUpdate({
    documents: [custom],
    sectionId: 'exam',
    label: '시험 일정',
    color: '#d68a45',
    now: 20,
  }), (error) => error instanceof ReminderSectionError && error.code === 'reminder-section/duplicate-color')
})

test('deleting a typed section moves its reminders to general before hiding it', () => {
  const performance = prepareReminderSectionDelete({
    documents: [],
    sectionId: 'performance',
    now: 30,
  })
  assert.equal(performance.migrateToGeneral, true)
  assert.equal(performance.document.hidden, true)
  assert.equal(performance.deleteDocument, false)

  const customDelete = prepareReminderSectionDelete({
    documents: [custom],
    sectionId: custom.id,
    now: 30,
  })
  assert.equal(customDelete.migrateToGeneral, true)
  assert.equal(customDelete.deleteDocument, true)
  assert.equal(customDelete.document, null)
})

test('deleting 전체 only hides the aggregate filter and deleting 일반 keeps task reminders general', () => {
  const all = prepareReminderSectionDelete({ documents: [], sectionId: 'all', now: 40 })
  assert.equal(all.migrateToGeneral, false)
  assert.equal(all.document.hidden, true)

  const task = prepareReminderSectionDelete({ documents: [], sectionId: 'task', now: 40 })
  assert.equal(task.migrateToGeneral, false)
  assert.equal(task.document.hidden, true)
})

test('the final visible section cannot be deleted', () => {
  const hiddenDocuments = [
    { id: 'all', label: '전체', color: '', hidden: true, createdAt: 1, updatedAt: 1 },
    { id: 'performance', label: '수행평가', color: '#7c83ff', hidden: true, createdAt: 1, updatedAt: 1 },
    { id: 'exam', label: '시험', color: '#ef6b66', hidden: true, createdAt: 1, updatedAt: 1 },
    { id: 'material', label: '준비물', color: '#56a781', hidden: true, createdAt: 1, updatedAt: 1 },
  ]
  assert.throws(() => prepareReminderSectionDelete({
    documents: hiddenDocuments,
    sectionId: 'task',
  }), (error) => error instanceof ReminderSectionError && error.code === 'reminder-section/last-visible')
})
