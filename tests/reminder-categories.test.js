import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REMINDER_CATEGORY_COLORS,
  TODO_TYPES,
  createReminderCategoryId,
  isReminderTypeId,
  normalizeReminderCategory,
  reminderTypeColor,
  reminderTypeLabel,
  usedReminderCategoryColors,
} from '../src/reminder-categories.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('built-in reminder types keep one stable color shared by home, rows, and filters', () => {
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
})

test('custom reminder categories use their color as a stable unique type id', () => {
  const color = REMINDER_CATEGORY_COLORS.find((item) => !TODO_TYPES.some((type) => type.color === item.id)).id
  const category = normalizeReminderCategory({
    id: createReminderCategoryId(color),
    label: '  동아리  ',
    color,
    createdAt: 10,
    updatedAt: 11,
  })

  assert.equal(category.id, `custom-${color.slice(1)}`)
  assert.equal(category.label, '동아리')
  assert.equal(isReminderTypeId(category.id), true)
  assert.equal(reminderTypeLabel(category.id, [category]), '동아리')
  assert.equal(reminderTypeColor(category.id, [category]), color)
  assert.equal(usedReminderCategoryColors([category]).has(color), true)
  assert.equal(normalizeReminderCategory({ ...category, id: 'custom-ffffff' }), null)
})

test('reminder page renders dots, a circular add control, and the shared bottom-sheet category editor', () => {
  const page = read('src/todo-stage5-ai.jsx')
  const css = read('src/todo-stage5.css')

  assert.match(page, /className="todo-kind-line"[\s\S]*?className="reminder-type-dot"/)
  assert.match(page, /item\.id !== 'all'[\s\S]*?className="reminder-filter-dot"/)
  assert.match(page, /className="reminder-filter-add"[\s\S]*?aria-label="리마인더 섹션 추가"/)
  assert.match(page, /className="reminder-category-sheet"/)
  assert.match(page, /<UnifiedBottomSheet[\s\S]*?title="새 섹션"/)
  assert.match(page, /disabled=\{used\}/)
  assert.match(page, /types\.map\(\(type\)/)
  assert.match(css, /\.reminder-filter-row > button\.reminder-filter-add\s*\{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;[\s\S]*?border-radius:\s*50%;/)
})

test('custom categories sync by isolated class and Firestore accepts only the approved custom palette', () => {
  const sync = read('src/school-sync.js')
  const todo = read('src/todo.jsx')
  const rules = read('firestore.rules')

  assert.match(sync, /collection\(db, 'classes', classKeyFor\(profile\), 'reminderCategories'\)/)
  assert.match(sync, /export function listenClassReminderCategories/)
  assert.match(sync, /export async function writeClassReminderCategory/)
  assert.match(todo, /school\.reminderCategories\.\$\{REMINDER_CATEGORIES_CACHE_VERSION\}\.\$\{classKey\}/)
  assert.match(todo, /usedReminderCategoryColors\(existing\)\.has\(category\.color\)/)
  assert.match(rules, /request\.resource\.data\.type\.matches\('\^custom-\[0-9a-f\]\{6\}\$'\)/)
  assert.match(rules, /match \/classes\/\{classId\}\/reminderCategories\/\{categoryId\}/)
  assert.match(rules, /request\.resource\.data\.color in \[/)
})
