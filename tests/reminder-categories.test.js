import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CUSTOM_REMINDER_CATEGORY_COLORS,
  REMINDER_CATEGORY_COLORS,
  reminderFilterOptions,
  reminderSectionById,
  reminderTypeColor,
  reminderTypeLabel,
  reminderTypeOptions,
  usedReminderCategoryColors,
} from '../src/reminder-categories.js'
import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const BUILTIN_REMINDER_TYPE_COUNT = 4
const custom = {
  id: 'custom-a1b2c3',
  label: '동아리',
  color: '#d68a45',
  hidden: false,
  createdAt: 10,
  updatedAt: 10,
}

test('built-in reminder types keep defaults until a class override changes them', () => {
  assert.equal(reminderTypeLabel('task', []), '일반')
  assert.equal(reminderTypeColor('task', []), '#90939a')

  const categories = [{
    id: 'task',
    label: '과제',
    color: '#3f91c7',
    hidden: false,
    createdAt: 1,
    updatedAt: 2,
  }]
  assert.equal(reminderTypeLabel('task', categories), '과제')
  assert.equal(reminderTypeColor('task', categories), '#3f91c7')
})

test('custom reminder category ids stay stable when their class color changes', () => {
  const categories = [custom]
  assert.equal(reminderTypeLabel(custom.id, categories), '동아리')
  assert.equal(reminderTypeColor(custom.id, categories), '#d68a45')
  assert.deepEqual(reminderTypeOptions(categories).at(-1), {
    id: custom.id,
    label: '동아리',
    color: '#d68a45',
    hidden: false,
    createdAt: 10,
    updatedAt: 10,
  })
})

test('deleted built-in sections are hidden from filters without losing reminder display metadata', () => {
  const categories = [{
    id: 'performance',
    label: '발표',
    color: '#7c83ff',
    hidden: true,
    createdAt: 1,
    updatedAt: 2,
  }]
  const filters = reminderFilterOptions(categories)
  assert.equal(filters.some((item) => item.id === 'performance'), false)
  assert.equal(reminderTypeLabel('performance', categories), '발표')
  assert.equal(reminderTypeColor('performance', categories), '#7c83ff')
  assert.equal(reminderSectionById('performance', categories)?.hidden, true)
})

test('reminder page build patch adds long-press section editing and keeps custom add colors safe', () => {
  const raw = read('src/todo-stage5-ai.jsx')
  const page = patchPreviewSHubV2Source(raw, path.join(root, 'src', 'todo-stage5-ai.jsx'))
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

test('adding the name of a hidden built-in section restores it instead of creating a duplicate custom section', () => {
  const raw = read('src/todo-stage5-ai.jsx')
  const sectionPatched = patchPreviewSHubV2Source(raw, path.join(root, 'src', 'todo-stage5-ai.jsx'))
  const page = patchPreviewReminderPolishSource(sectionPatched, path.join(root, 'src', 'todo-stage5-ai.jsx'))
  const client = read('src/reminder-section-client.js')

  assert.match(page, /const hiddenBuiltinSections = useMemo/)
  assert.match(page, /const categoryRestoreTarget = useMemo/)
  assert.match(page, /canonicalLabels = \{ task: '일반', performance: '수행평가', exam: '시험', material: '준비물' \}/)
  assert.match(page, /setCategoryColor\(categoryRestoreTarget\.color\)/)
  assert.match(page, /disabled=\{!availableCategoryColors\.length && !hasRestorableHiddenBuiltin\}/)
  assert.match(page, /action: 'restore'/)
  assert.match(page, /숨겨진 \{categoryRestoreTarget\.label\} 섹션을 다시 사용합니다/)
  assert.match(page, /categoryRestoreTarget \? '복원' : '추가'/)
  assert.match(client, /if \(action === 'restore'\)/)
  assert.match(client, /current\.hidden/)
})

test('class-scoped section overrides use authenticated production access with a rate-limit fallback', () => {
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
  assert.equal(usedReminderCategoryColors([]).size, BUILTIN_REMINDER_TYPE_COUNT)

  // The already-published Firestore rules still validate direct custom additions only.
  assert.match(rules, /categoryId\.matches\('\^custom-\[0-9a-f\]\{6\}\$'\)/)
  assert.doesNotMatch(rules, /categoryId in \['all', 'task', 'performance', 'exam', 'material'\]/)
  assert.doesNotMatch(rules, /request\.resource\.data\.get\('hidden', false\) is bool/)

  // Primary traffic stays on the stable production endpoint. While Vercel's main build is
  // rate-limited, only the old preview-only 403 is retried against the immutable READY build.
  assert.match(client, /school-reminder-backend\.vercel\.app\/api\/reminder-sections/)
  assert.match(client, /school-reminder-backend-mm1t9pzs6-jhyxng9088-7711\.vercel\.app\/api\/reminder-sections/)
  assert.match(client, /result\.response\?\.status === 403/)
  assert.match(client, /reminder-section\/preview-class-required/)
  assert.match(client, /postSectionChange\(REMINDER_SECTION_FALLBACK_API_URL/)
  assert.match(client, /ensureSignedIn\(\)/)

  // The server derives classId only from the verified user identity, so a student can edit only their own class.
  assert.match(classApi, /const reminderSectionMode = String\(req\.query\?\.mode \|\| ''\)\.trim\(\) === 'reminder-sections'/)
  assert.match(classApi, /function isReminderSectionClassId/)
  assert.match(classApi, /\^\(\?:preview-\)\?class-/)
  assert.match(classApi, /if \(!isReminderSectionClassId\(classId\)\)/)
  assert.doesNotMatch(classApi, /preview-class-required/)
  assert.match(classApi, /verifyIdToken\(token\)/)
  assert.match(classApi, /const classId = String\(identity\.data\(\)\?\.classId/)
  assert.doesNotMatch(classApi, /body\?\.classId/)
  assert.match(classApi, /collection\('reminderCategories'\)/)
  assert.match(classApi, /collection\('todos'\)\.where\('type', '==', sectionId\)/)
  assert.match(classApi, /collection\('reminderSectionArchives'\)/)
  assert.match(classApi, /action === 'restore'/)
  assert.match(classApi, /restoreArchivedReminderSectionTodos/)
  assert.match(classApi, /type:\s*'task'/)
  assert.match(vercel, /"source": "\/api\/reminder-sections"[\s\S]*?"destination": "\/api\/class-roster\?mode=reminder-sections"/)
})
