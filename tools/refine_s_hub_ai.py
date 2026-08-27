from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1))


def replace_exact(path, old, new, expected):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected exactly {expected} matches, found {count}')
    target.write_text(text.replace(old, new))


# Group multi-day official events so Q&A/conflict logic sees one real event, not repeated single days.
replace_once(
    'src/s-hub-ai-core.js',
    """function normalizeCustomAcademic(event, today) {
  const startDate = String(event?.startDate || '')
""",
    """function groupOfficialAcademicEvents(events) {
  const sorted = [...(events || [])].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
  const groups = []
  sorted.forEach((event) => {
    const last = groups[groups.length - 1]
    const consecutive = last &&
      last.title === event.title &&
      last.detail === event.detail &&
      dateDistance(last.endDate, event.startDate) === 1
    if (consecutive) {
      last.endDate = event.endDate
      last.important = Boolean(last.important || event.important)
      return
    }
    groups.push({ ...event })
  })
  return groups
}

function normalizeCustomAcademic(event, today) {
  const startDate = String(event?.startDate || '')
""",
)

replace_once(
    'src/s-hub-ai-core.js',
    """  const timetable = (timetableDays || [])
    .map(normalizeTimetableDay)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)

  const official = (academicEvents || [])
    .map((event, index) => normalizeOfficialAcademic(event, today, index))
    .filter(Boolean)
""",
    """  const timetable = (timetableDays || [])
    .map(normalizeTimetableDay)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 14)

  const official = groupOfficialAcademicEvents((academicEvents || [])
    .map((event, index) => normalizeOfficialAcademic(event, today, index))
    .filter(Boolean))
""",
)

# Expose the class-shared reminder source so conflict detection does not miss a reminder
# merely because this student personally completed it.
replace_once(
    'src/todo.jsx',
    """  return {
    todos,
    saveTodo,
""",
    """  return {
    todos,
    sharedTodos,
    saveTodo,
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """  const {
    todos,
    saveTodo,
""",
    """  const {
    todos,
    sharedTodos,
    saveTodo,
""",
)

replace_once(
    'src/todo-stage5-ai.jsx',
    """      const conflict = await findReminderConflict(candidate, todos, new Date(), { excludeId: candidate?.id || '' })
""",
    """      const conflict = await findReminderConflict(candidate, sharedTodos || todos, new Date(), { excludeId: candidate?.id || '' })
""",
)

# Keep Q&A context personal (completed reminders hidden), but use class-shared reminders for import conflict checks.
replace_once(
    'src/main.jsx',
    """    const timetableDays = Array.from({ length: 8 }, (_, offset) => {
""",
    """    const timetableDays = Array.from({ length: 14 }, (_, offset) => {
""",
)

replace_once(
    'src/main.jsx',
    """  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, academicData?.events])

  async function importAIItems(items) {
""",
    """  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, academicData?.events])

  const aiConflictContext = useMemo(() => {
    const sharedReminderContext = buildSchoolAIContext({
      now,
      todos: todoData.sharedTodos || todoData.todos,
    })
    return {
      ...aiContext,
      reminders: sharedReminderContext.reminders,
    }
  }, [aiContext, now, todoData.sharedTodos, todoData.todos])

  async function importAIItems(items) {
""",
)

replace_once(
    'src/main.jsx',
    """        context={aiContext}
        onImportItems={importAIItems}
""",
    """        context={aiContext}
        conflictContext={aiConflictContext}
        onImportItems={importAIItems}
""",
)

replace_once(
    'src/s-hub-ai-sheet.jsx',
    """  context,
  onImportItems,
""",
    """  context,
  conflictContext = context,
  onImportItems,
""",
)

replace_exact(
    'src/s-hub-ai-sheet.jsx',
    """reviewSchoolImportConflicts(items, context, now)""",
    """reviewSchoolImportConflicts(items, conflictContext, now)""",
    2,
)

# Extra regression coverage for the edge cases above.
test_path = Path('tests/s-hub-ai-core.test.js')
test_text = test_path.read_text()
addition = r'''

test('official consecutive academic dates are grouped into one multi-day event', () => {
  const context = buildSchoolAIContext({
    now: NOW,
    academicEvents: [
      { rawDate: '20260928', name: '2학기 중간고사', content: '지필평가' },
      { rawDate: '20260929', name: '2학기 중간고사', content: '지필평가' },
      { rawDate: '20260930', name: '2학기 중간고사', content: '지필평가' },
      { rawDate: '20261001', name: '2학기 중간고사', content: '지필평가' },
    ],
  })

  assert.equal(context.academic.length, 1)
  assert.equal(context.academic[0].startDate, '2026-09-28')
  assert.equal(context.academic[0].endDate, '2026-10-01')
})

test('Q&A timetable context keeps up to fourteen days', () => {
  const timetableDays = Array.from({ length: 16 }, (_, index) => {
    const date = new Date(2026, 7, 27 + index, 12, 0, 0, 0)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date: key, periods: [{ number: 1, subject: `과목${index + 1}` }] }
  })
  const context = buildSchoolAIContext({ now: NOW, timetableDays })
  assert.equal(context.timetable.length, 14)
})
'''
if "official consecutive academic dates are grouped" not in test_text:
    test_path.write_text(test_text.rstrip() + addition + '\n')

integration_path = Path('tests/s-hub-ai-integration.test.js')
integration_text = integration_path.read_text()
addition2 = r'''

test('duplicate checks use class-shared reminders instead of personal completion state', () => {
  const main = read('src/main.jsx')
  const todo = read('src/todo.jsx')
  const todoAI = read('src/todo-stage5-ai.jsx')

  assert.match(todo, /sharedTodos,/)
  assert.match(main, /todoData\.sharedTodos/)
  assert.match(main, /conflictContext=\{aiConflictContext\}/)
  assert.match(todoAI, /sharedTodos \|\| todos/)
})
'''
if "duplicate checks use class-shared reminders" not in integration_text:
    integration_path.write_text(integration_text.rstrip() + addition2 + '\n')
