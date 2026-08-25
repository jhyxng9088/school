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

const mainPath = 'src/main.jsx'
const todoPath = 'src/todo.jsx'
const swPath = 'public/sw.js'

let main = fs.readFileSync(mainPath, 'utf8')
let todo = fs.readFileSync(todoPath, 'utf8')
let sw = fs.readFileSync(swPath, 'utf8')

requireText(main, "import { TodoHomePreview, TodoPage, useTodos } from './todo'", 'main import')
main = main.replace(
  "import { TodoHomePreview, TodoPage, useTodos } from './todo'",
  "import { TodoHomePreview, TodoPage, useTodos } from './todo'\nimport { readStudentProfile, saveStudentProfile, useSharedTimetable } from './school-sync'",
)

main = replaceExactly(
  main,
  /function NameSetup\(\{ onSave \}\) \{[\s\S]*?\n\}\n\nconst tabs =/,
  `function StudentSetup({ initialName = '', onSave }) {
  const [classNumber, setClassNumber] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  const classValue = Number(classNumber)
  const studentValue = Number(studentNumber)
  const validClass = Number.isInteger(classValue) && classValue >= 1 && classValue <= 30
  const validStudent = Number.isInteger(studentValue) && studentValue >= 1 && studentValue <= 60
  const canSubmit = Boolean(trimmed && validClass && validStudent)

  function submit(event) {
    event.preventDefault()
    if (!canSubmit) return
    onSave({
      name: trimmed,
      classNumber: classValue,
      studentNumber: studentValue,
    })
  }

  return (
    <main className="onboarding-page">
      <form className="onboarding-card name-card" onSubmit={submit}>
        <p className="eyebrow">마지막 설정</p>
        <h1>반, 번호, 이름 알려줘</h1>
        <p className="onboarding-copy">같은 반의 시간표와 리마인더는 함께 쓰고, 완료와 삭제 상태는 같은 반·번호·이름을 입력한 기기끼리만 이어져.</p>
        <label className="name-field">
          <span>반</span>
          <input
            value={classNumber}
            onChange={(event) => setClassNumber(event.target.value.replace(/\\D/g, '').slice(0, 2))}
            placeholder="예: 7"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
          />
        </label>
        <label className="name-field">
          <span>번호</span>
          <input
            value={studentNumber}
            onChange={(event) => setStudentNumber(event.target.value.replace(/\\D/g, '').slice(0, 2))}
            placeholder="예: 18"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <label className="name-field">
          <span>이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름 입력"
            autoComplete="name"
            maxLength={20}
          />
        </label>
        <button className="primary-button" disabled={!canSubmit}>시작하기</button>
      </form>
    </main>
  )
}

const tabs =`,
  'student setup',
)

main = replaceExactly(
  main,
  /function AppShell\(\{ name \}\) \{\n  const \[activeTab, setActiveTab\] = useState\('home'\)\n  const \[contentDirection, setContentDirection\] = useState\(1\)\n  const \[weeklySchedule, setWeeklySchedule\] = useState\(loadWeeklySchedule\)\n  const \[overrides, setOverrides\] = useState\(loadOverrides\)\n  const now = useNow\(\)\n  const schoolData = useSchoolData\(now\)\n  const todoData = useTodos\(\)/,
  `function AppShell({ profile }) {
  const [activeTab, setActiveTab] = useState('home')
  const [contentDirection, setContentDirection] = useState(1)
  const now = useNow()
  const {
    weeklySchedule,
    overrides,
    commitWeeklySchedule,
    commitOverrides,
  } = useSharedTimetable(profile, now)
  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)
  const name = profile.name`,
  'app shell cloud state',
)

main = replaceExactly(
  main,
  /  useEffect\(\(\) => \{\n    const pruned = pruneExpiredOverrides\(overrides, now\)\n    if \(JSON\.stringify\(pruned\) === JSON\.stringify\(overrides\)\) return\n    saveOverrides\(pruned\)\n    setOverrides\(pruned\)\n  \}, \[now, overrides\]\)\n\n  function commitWeeklySchedule\(nextSchedule\) \{\n    saveWeeklySchedule\(nextSchedule\)\n    setWeeklySchedule\(nextSchedule\)\n  \}\n\n  function commitOverrides\(nextOverrides\) \{\n    const pruned = pruneExpiredOverrides\(nextOverrides, now\)\n    saveOverrides\(pruned\)\n    setOverrides\(pruned\)\n  \}/,
  `  useEffect(() => {
    const pruned = pruneExpiredOverrides(overrides, now)
    if (JSON.stringify(pruned) === JSON.stringify(overrides)) return
    commitOverrides(pruned)
  }, [now, overrides, commitOverrides])`,
  'app shell timetable commits',
)

main = replaceExactly(
  main,
  /function App\(\) \{[\s\S]*?\n\}\n\ncreateRoot/,
  `function App() {
  const [profile, setProfile] = useState(readStudentProfile)
  const [installDone, setInstallDone] = useState(() => localStorage.getItem(INSTALL_DONE_KEY) === 'true')
  const standalone = isStandalone()
  const legacyName = localStorage.getItem(USER_NAME_KEY) || ''

  function completeInstallGuide() {
    localStorage.setItem(INSTALL_DONE_KEY, 'true')
    setInstallDone(true)
  }

  function saveProfile(nextProfile) {
    const saved = saveStudentProfile(nextProfile)
    if (!saved) return
    localStorage.setItem(USER_NAME_KEY, saved.name)
    setProfile(saved)
  }

  if (!standalone && !installDone) return <InstallGuide onDone={completeInstallGuide} />
  if (!profile) return <StudentSetup initialName={legacyName} onSave={saveProfile} />
  return <AppShell profile={profile} />
}

createRoot`,
  'app profile bootstrap',
)

requireText(todo, "import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'", 'todo react import')
todo = todo.replace(
  "import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'",
  `import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  listenClassTodos,
  listenStudentTodoState,
  migrateLegacyTodos,
  profileSignature,
  writeSharedTodo,
  writeStudentTodoState,
} from './school-sync'`,
)

todo = replaceExactly(
  todo,
  /export function useTodos\(\) \{[\s\S]*?\n\}\n\nfunction typeLabel/,
  `function sharedTodoShape(todo) {
  return {
    id: String(todo.id),
    type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
    title: String(todo.title || '').trim().slice(0, 80),
    dueDate: String(todo.dueDate || ''),
    dueTime: String(todo.dueTime || ''),
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
  }
}

function initialPersonalState(todos) {
  return Object.fromEntries(todos.map((todo) => [todo.id, {
    completed: Boolean(todo.completed),
    hidden: false,
    updatedAt: 0,
  }]))
}

function mergeSharedTodos(sharedTodos, personalState) {
  return sortTodos(sharedTodos
    .filter((todo) => !personalState[todo.id]?.hidden)
    .map((todo) => ({
      ...todo,
      completed: Boolean(personalState[todo.id]?.completed),
    })))
}

export function useTodos(profile) {
  const legacyTodosRef = useRef(null)
  if (legacyTodosRef.current === null) legacyTodosRef.current = loadTodos()

  const [sharedTodos, setSharedTodos] = useState(() => legacyTodosRef.current.map(sharedTodoShape))
  const [personalState, setPersonalState] = useState(() => initialPersonalState(legacyTodosRef.current))
  const signature = profileSignature(profile)
  const todos = useMemo(() => mergeSharedTodos(sharedTodos, personalState), [sharedTodos, personalState])

  useEffect(() => {
    persistTodos(todos)
  }, [todos])

  useEffect(() => {
    if (!signature) return undefined
    let disposed = false
    let stopClassTodos = () => {}
    let stopPersonalState = () => {}

    ;(async () => {
      try {
        await migrateLegacyTodos(profile, legacyTodosRef.current)
        if (disposed) return

        stopClassTodos = listenClassTodos(
          profile,
          (remoteTodos) => {
            if (disposed) return
            setSharedTodos(remoteTodos.map(sharedTodoShape))
          },
          (error) => console.error('Class reminder sync failed:', error),
        )

        stopPersonalState = listenStudentTodoState(
          profile,
          (remoteState) => {
            if (disposed) return
            setPersonalState(remoteState)
          },
          (error) => console.error('Personal reminder state sync failed:', error),
        )
      } catch (error) {
        console.error('Reminder cloud migration failed:', error)
      }
    })()

    return () => {
      disposed = true
      stopClassTodos()
      stopPersonalState()
    }
  }, [signature])

  function saveTodo(input) {
    const title = String(input.title || '').trim()
    const dueDate = String(input.dueDate || '')
    if (!title || !dueDate) return ''
    const type = TODO_TYPES.some((item) => item.id === input.type) ? input.type : 'task'
    const dueTime = String(input.dueTime || '')

    if (input.id) {
      const updatedAt = Date.now()
      let nextTodo = null
      setSharedTodos((current) => current.map((todo) => {
        if (todo.id !== input.id) return todo
        nextTodo = {
          ...todo,
          type,
          title,
          dueDate,
          dueTime,
          updatedAt,
        }
        return nextTodo
      }))
      if (nextTodo) {
        writeSharedTodo(profile, nextTodo)
          .catch((error) => console.error('Shared reminder update failed:', error))
      }
      return input.id
    }

    const now = Date.now()
    const todo = {
      id: \`\${now}-\${Math.random().toString(36).slice(2, 8)}\`,
      type,
      title,
      dueDate,
      dueTime,
      createdAt: now,
      updatedAt: now,
    }
    setSharedTodos((current) => [...current, todo])
    writeSharedTodo(profile, todo)
      .catch((error) => console.error('Shared reminder create failed:', error))
    return todo.id
  }

  function toggleTodo(id) {
    const target = todos.find((todo) => todo.id === id)
    if (!target) return
    const completed = !target.completed
    setPersonalState((current) => ({
      ...current,
      [id]: {
        ...current[id],
        completed,
        hidden: false,
        updatedAt: Date.now(),
      },
    }))
    writeStudentTodoState(profile, id, { completed, hidden: false })
      .catch((error) => console.error('Personal reminder completion sync failed:', error))
  }

  function removeTodo(id) {
    const completed = Boolean(personalState[id]?.completed)
    setPersonalState((current) => ({
      ...current,
      [id]: {
        ...current[id],
        completed,
        hidden: true,
        updatedAt: Date.now(),
      },
    }))
    writeStudentTodoState(profile, id, { completed, hidden: true })
      .catch((error) => console.error('Personal reminder delete sync failed:', error))
  }

  return { todos, saveTodo, toggleTodo, removeTodo }
}

function typeLabel`,
  'todo cloud hook',
)

if (!sw.includes("const CACHE_NAME = 'school-shell-v63'")) {
  throw new Error('service worker: expected v63 cache marker')
}
sw = sw.replace("const CACHE_NAME = 'school-shell-v63'", "const CACHE_NAME = 'school-shell-v64'")

fs.writeFileSync(mainPath, main)
fs.writeFileSync(todoPath, todo)
fs.writeFileSync(swPath, sw)

console.log('Cloud sync migration applied with all source guards satisfied.')
