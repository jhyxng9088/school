import fs from 'node:fs'

function replaceExactly(source, pattern, replacement, label) {
  const matches = source.match(pattern)
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches?.length || 0}`)
  }
  return source.replace(pattern, replacement)
}

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label}: expected source text was not found`)
}

const todoPath = 'src/todo.jsx'
const syncPath = 'src/school-sync.js'
const swPath = 'public/sw.js'

let todo = fs.readFileSync(todoPath, 'utf8')
let sync = fs.readFileSync(syncPath, 'utf8')
let sw = fs.readFileSync(swPath, 'utf8')

todo = replaceExactly(
  todo,
  /    if \(input\.id\) \{\n      const updatedAt = Date\.now\(\)\n      let nextTodo = null\n      setSharedTodos\(\(current\) => current\.map\(\(todo\) => \{\n        if \(todo\.id !== input\.id\) return todo\n        nextTodo = \{\n          \.\.\.todo,\n          type,\n          title,\n          dueDate,\n          dueTime,\n          updatedAt,\n        \}\n        return nextTodo\n      \}\)\)\n      if \(nextTodo\) \{\n        writeSharedTodo\(profile, nextTodo\)\n          \.catch\(\(error\) => console\.error\('Shared reminder update failed:', error\)\)\n      \}\n      return input\.id\n    \}/,
  `    if (input.id) {
      const currentTodo = sharedTodos.find((todo) => todo.id === input.id)
      if (!currentTodo) return ''
      const nextTodo = {
        ...currentTodo,
        type,
        title,
        dueDate,
        dueTime,
        updatedAt: Date.now(),
      }
      setSharedTodos((current) => current.map((todo) => todo.id === input.id ? nextTodo : todo))
      writeSharedTodo(profile, nextTodo)
        .catch((error) => console.error('Shared reminder update failed:', error))
      return input.id
    }`,
  'shared reminder edit',
)

sync = replaceExactly(
  sync,
  /async function writeTimetable\(profile, value\) \{\n  await ensureSignedIn\(\)\n  await setDoc\(timetableRef\(profile\), \{\n    weeklySchedule: normalizeWeeklySchedule\(value\.weeklySchedule\),\n    overrides: pruneExpiredOverrides\(value\.overrides \|\| \{\}\),\n    updatedAt: Date\.now\(\),\n  \}, \{ merge: true \}\)\n\}/,
  `async function writeInitialTimetable(profile, value) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(value.weeklySchedule),
    overrides: pruneExpiredOverrides(value.overrides || {}),
    updatedAt: Date.now(),
  })
}

async function writeWeeklyScheduleCloud(profile, weeklySchedule) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(weeklySchedule),
    updatedAt: Date.now(),
  }, { merge: true })
}

async function writeOverridesCloud(profile, overrides) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    overrides: pruneExpiredOverrides(overrides || {}),
    updatedAt: Date.now(),
  }, { merge: true })
}`,
  'timetable cloud writers',
)

sync = replaceExactly(
  sync,
  /              writeTimetable\(profile, \{\n                weeklySchedule: initialWeeklyRef\.current,\n                overrides: initialOverridesRef\.current,\n              \}\)\.catch\(\(error\) => console\.error\('Initial timetable sync failed:', error\)\)/,
  `              writeInitialTimetable(profile, {
                weeklySchedule: initialWeeklyRef.current,
                overrides: initialOverridesRef.current,
              }).catch((error) => console.error('Initial timetable sync failed:', error))`,
  'initial timetable writer',
)

sync = replaceExactly(
  sync,
  /  const commitWeeklySchedule = useCallback\(\(nextSchedule\) => \{\n    const normalized = normalizeWeeklySchedule\(nextSchedule\)\n    saveWeeklySchedule\(normalized\)\n    setWeeklySchedule\(normalized\)\n    writeTimetable\(profile, \{ weeklySchedule: normalized, overrides \}\)\n      \.catch\(\(error\) => console\.error\('Shared timetable save failed:', error\)\)\n  \}, \[signature, overrides\]\)/,
  `  const commitWeeklySchedule = useCallback((nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    saveWeeklySchedule(normalized)
    setWeeklySchedule(normalized)
    writeWeeklyScheduleCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable save failed:', error))
  }, [signature])`,
  'weekly timetable commit',
)

sync = replaceExactly(
  sync,
  /  const commitOverrides = useCallback\(\(nextOverrides\) => \{\n    const normalized = pruneExpiredOverrides\(nextOverrides, now\)\n    saveOverrides\(normalized\)\n    setOverrides\(normalized\)\n    writeTimetable\(profile, \{ weeklySchedule, overrides: normalized \}\)\n      \.catch\(\(error\) => console\.error\('Shared timetable override save failed:', error\)\)\n  \}, \[signature, weeklySchedule, now\]\)/,
  `  const commitOverrides = useCallback((nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    saveOverrides(normalized)
    setOverrides(normalized)
    writeOverridesCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable override save failed:', error))
  }, [signature, now])`,
  'override timetable commit',
)

requireText(sw, "const CACHE_NAME = 'school-shell-v64'", 'service worker cache')
sw = sw.replace("const CACHE_NAME = 'school-shell-v64'", "const CACHE_NAME = 'school-shell-v65'")

fs.writeFileSync(todoPath, todo)
fs.writeFileSync(syncPath, sync)
fs.writeFileSync(swPath, sw)

console.log('Realtime cloud sync consistency fixes applied with all source guards satisfied.')
