import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CUSTOM_REMINDER_CATEGORY_COLORS,
  REMINDER_CATEGORY_COLORS,
  TODO_TYPES,
  createReminderCategoryId,
  isReminderTypeId,
  normalizeReminderCategory,
  reminderFilterOptions,
  reminderSectionById,
  reminderTypeColor,
  reminderTypeLabel,
  usedReminderCategoryColors,
} from '../src/reminder-categories.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('built-in reminder types keep defaults until a class override changes them', () => {
  assert.deepEqual(TODO_TYPES.map(({ id, label }) => [id, label]), [
    ['task', '일반'],
    ['performance', '수행평가'],
    ['exam', '시험'],
    ['material', '준비물'],
  ])
  assert.equal(new Set(TODO_TYPES.map((type) => type.color)).size, TODO_TYPES.length)
  for (const type of TODO_TYPES) {
    assert.equal(reminderTypeColor(type.id), type.color)
    assert.equal(reminderTypeLabel(type.id), type.label)
  }

  const override = normalizeReminderCategory({
    id: 'task',
    label: '과제',
    color: '#d68a45',
    hidden: false,
    createdAt: 10,
    updatedAt: 11,
  })
  assert.equal(reminderTypeLabel('task', [override]), '과제')
  assert.equal(reminderTypeColor('task', [override]), '#d68a45')
})

test('custom reminder category ids stay stable when their class color changes', () => {
  const firstColor = CUSTOM_REMINDER_CATEGORY_COLORS[0].id
  const nextColor = CUSTOM_REMINDER_CATEGORY_COLORS[1].id
  const id = createReminderCategoryId(firstColor)
  assert.match(id, /^custom-[0-9a-f]{6}$/)

  const category = normalizeReminderCategory({
    id,
    label: '  동아리  ',
    color: firstColor,
    createdAt: 10,
    updatedAt: 11,
  })
  const edited = normalizeReminderCategory({ ...category, color: nextColor, hidden: false, updatedAt: 12 })

  assert.equal(category.label, '동아리')
  assert.equal(edited.id, category.id)
  assert.equal(edited.color, nextColor)
  assert.equal(isReminderTypeId(category.id), true)
  assert.equal(reminderTypeLabel(category.id, [edited]), '동아리')
  assert.equal(reminderTypeColor(category.id, [edited]), nextColor)
  assert.equal(normalizeReminderCategory({ ...category, id: 'custom-zzzzzz' }), null)
})

test('deleted built-in sections are hidden from filters without losing reminder display metadata', () => {
  const hidden = normalizeReminderCategory({
    id: 'performance',
    label: '수행',
    color: '#7c83ff',
    hidden: true,
    createdAt: 10,
    updatedAt: 11,
  })
  const filters = reminderFilterOptions([hidden])
  assert.equal(filters.some((item) => item.id === 'performance'), false)
  assert.equal(reminderSectionById('performance', [hidden]).hidden, true)
  assert.equal(reminderTypeLabel('performance', [hidden]), '수행')
  assert.equal(reminderTypeColor('performance', [hidden]), '#7c83ff')
})

test('reminder page build patch adds long-press section editing and keeps custom add colors safe', () => {
  const source = read('src/todo-stage5-ai.jsx')
  const page = patchPreviewSHubV2Source(source, '/workspace/src/todo-stage5-ai.jsx')
  const css = read('src/preview-section-management.css')

  assert.match(page, /reminderFilterOptions\(categories\)/)
  assert.match(page, /onPointerDown=\{\(event\) => beginSectionPress\(item, event\)\}/)
  assert.match(page, /className="reminder-section-action-sheet"/)
  assert.match(page, /className="reminder-section-edit-sheet"/)
  assert.match(page, /saveReminderSectionChange/)
  assert.match(page, /CUSTOM_REMINDER_CATEGORY_COLORS\.filter/)
  assert.match(css, /\.reminder-section-action-sheet/)
  assert.match(css, /max-width:\s*360px/)
})

test('class-scoped section overrides use the isolated preview backend without changing the published custom-category rules', () => {
  const sync = read('src/school-sync.js')
  const todo = read('src/todo.jsx')
  const rules = read('firestore.rules')
  const client = read('src/reminder-section-client.js')
  const classApi = read('push-backend-v2/api/class-roster.js')
  const vercel = read('push-backend-v2/vercel.json')

  assert.match(sync, /collection\(db, 'classes', classKeyFor\(profile\), 'reminderCategories'\)/)
  assert.match(sync, /export function listenClassReminderCategories/)
  assert.match(todo, /school\.reminderCategories\.\$\{REMINDER_CATEGORIES_CACHE_VERSION\}\.\$\{classKey\}/)
  assert.equal(new Set(REMINDER_CATEGORY_COLORS.map((item) => item.id)).size, REMINDER_CATEGORY_COLORS.length)
  assert.equal(usedReminderCategoryColors([]).size, TODO_TYPES.length)

  // The already-published Firestore rules still validate direct custom additions only.
  assert.match(rules, /categoryId\.matches\('\^custom-\[0-9a-f\]\{6\}\$'\)/)
  assert.doesNotMatch(rules, /categoryId in \['all', 'task', 'performance', 'exam', 'material'\]/)
  assert.doesNotMatch(rules, /request\.resource\.data\.get\('hidden', false\) is bool/)

  // Built-in/all edits and deletes share the existing authenticated class function,
  // staying preview-only without adding a thirteenth Vercel function.
  assert.match(client, /school-reminder-backend-git-preview-s-hub-v2-jhyxng9088-7711\.vercel\.app\/api\/reminder-sections/)
  assert.match(client, /ensureSignedIn\(\)/)
  assert.match(classApi, /const reminderSectionMode = String\(req\.query\?\.mode \|\| ''\)\.trim\(\) === 'reminder-sections'/)
  assert.match(classApi, /\^preview-class-/)
  assert.match(classApi, /collection\('reminderCategories'\)/)
  assert.match(classApi, /collection\('todos'\)\.where\('type', '==', sectionId\)/)
  assert.match(classApi, /type:\s*'task'/)
  assert.match(vercel, /"source": "\/api\/reminder-sections"[\s\S]*?"destination": "\/api\/class-roster\?mode=reminder-sections"/)
})