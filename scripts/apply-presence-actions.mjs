import fs from 'node:fs'

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search)
  if (first < 0) throw new Error(`${label}: source not found`)
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source is not unique`)
  return source.slice(0, first) + replacement + source.slice(first + search.length)
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches.length}`)
  return source.replace(pattern, replacement)
}

const syncPath = 'src/school-sync.js'
const mainPath = 'src/main.jsx'
const todoPath = 'src/todo-stage5-ai.jsx'
const todoCssPath = 'src/todo-stage5.css'
const stylesPath = 'src/styles.css'
const rulesPath = 'firestore.rules'
const swPath = 'public/sw.js'

let sync = fs.readFileSync(syncPath, 'utf8')
let main = fs.readFileSync(mainPath, 'utf8')
let todo = fs.readFileSync(todoPath, 'utf8')
let todoCss = fs.readFileSync(todoCssPath, 'utf8')
let styles = fs.readFileSync(stylesPath, 'utf8')
let rules = fs.readFileSync(rulesPath, 'utf8')
let sw = fs.readFileSync(swPath, 'utf8')

sync = replaceOnce(
  sync,
  "const MIGRATION_VERSION = 'v1'\n",
  "const MIGRATION_VERSION = 'v1'\nconst PRESENCE_ACTIVE_MS = 90 * 1000\nconst PRESENCE_HEARTBEAT_MS = 30 * 1000\nconst PRESENCE_RECOUNT_MS = 15 * 1000\n",
  'presence constants',
)

sync = replaceOnce(
  sync,
  `function timetableRef(profile) {\n  return doc(db, 'classes', classKeyFor(profile), 'settings', 'timetable')\n}\n`,
  `function timetableRef(profile) {\n  return doc(db, 'classes', classKeyFor(profile), 'settings', 'timetable')\n}\n\nfunction classMembersCollection(profile) {\n  return collection(db, 'classes', classKeyFor(profile), 'members')\n}\n\nfunction classMemberRef(profile) {\n  return doc(db, 'classes', classKeyFor(profile), 'members', studentKeyFor(profile))\n}\n\nfunction classPresenceCollection(profile) {\n  return collection(db, 'classes', classKeyFor(profile), 'presence')\n}\n\nfunction classPresenceRef(profile, uid) {\n  return doc(db, 'classes', classKeyFor(profile), 'presence', uid)\n}\n`,
  'presence firestore refs',
)

sync = replaceOnce(
  sync,
  `export async function writeSharedTodo(profile, todo) {`,
  `export function useClassPresence(profile) {\n  const signature = profileSignature(profile)\n  const memberCountRef = useRef(0)\n  const presenceRowsRef = useRef([])\n  const [counts, setCounts] = useState({ online: 0, total: 0 })\n\n  useEffect(() => {\n    if (!signature) return undefined\n\n    let stopped = false\n    let unsubscribeMembers = () => {}\n    let unsubscribePresence = () => {}\n    let heartbeatTimer = null\n    let recountTimer = null\n\n    const recount = () => {\n      if (stopped) return\n      const threshold = Date.now() - PRESENCE_ACTIVE_MS\n      const activeStudents = new Set(\n        presenceRowsRef.current\n          .filter((item) => item.lastSeenMs >= threshold)\n          .map((item) => item.studentKey)\n          .filter(Boolean),\n      )\n      setCounts({ online: activeStudents.size, total: memberCountRef.current })\n    }\n\n    const heartbeat = async () => {\n      if (stopped || document.hidden) return\n      try {\n        const user = await ensureSignedIn()\n        if (stopped) return\n        await setDoc(classPresenceRef(profile, user.uid), {\n          studentKey: studentKeyFor(profile),\n          lastSeenMs: Date.now(),\n        })\n      } catch (error) {\n        console.error('Class presence heartbeat failed:', error)\n      }\n    }\n\n    const handleVisibility = () => {\n      if (!document.hidden) heartbeat()\n    }\n\n    ensureSignedIn()\n      .then(async (user) => {\n        if (stopped) return\n        const member = classMemberRef(profile)\n        const existing = await getDoc(member)\n        if (!existing.exists()) {\n          await setDoc(member, { joinedAt: Date.now() })\n        }\n        if (stopped) return\n\n        await setDoc(classPresenceRef(profile, user.uid), {\n          studentKey: studentKeyFor(profile),\n          lastSeenMs: Date.now(),\n        })\n        if (stopped) return\n\n        unsubscribeMembers = onSnapshot(\n          classMembersCollection(profile),\n          (snapshot) => {\n            memberCountRef.current = snapshot.size\n            recount()\n          },\n          (error) => console.error('Class member count sync failed:', error),\n        )\n\n        unsubscribePresence = onSnapshot(\n          classPresenceCollection(profile),\n          (snapshot) => {\n            presenceRowsRef.current = snapshot.docs.map((item) => ({\n              studentKey: String(item.data()?.studentKey || ''),\n              lastSeenMs: Number(item.data()?.lastSeenMs || 0),\n            }))\n            recount()\n          },\n          (error) => console.error('Class presence sync failed:', error),\n        )\n\n        heartbeatTimer = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_MS)\n        recountTimer = window.setInterval(recount, PRESENCE_RECOUNT_MS)\n        document.addEventListener('visibilitychange', handleVisibility)\n        window.addEventListener('focus', heartbeat)\n      })\n      .catch((error) => console.error('Class presence connection failed:', error))\n\n    return () => {\n      stopped = true\n      unsubscribeMembers()\n      unsubscribePresence()\n      if (heartbeatTimer) window.clearInterval(heartbeatTimer)\n      if (recountTimer) window.clearInterval(recountTimer)\n      document.removeEventListener('visibilitychange', handleVisibility)\n      window.removeEventListener('focus', heartbeat)\n    }\n  }, [signature])\n\n  return counts\n}\n\nexport async function writeSharedTodo(profile, todo) {`,
  'presence hook',
)

main = replaceOnce(
  main,
  "import { readStudentProfile, saveStudentProfile, useSharedTimetable } from './school-sync'",
  "import { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'",
  'main sync import',
)

main = replaceOnce(
  main,
  `function Home({ name, now, weeklySchedule, overrides, schoolData, todoData }) {`,
  `function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence }) {`,
  'home signature',
)

main = replaceOnce(
  main,
  `          <p className="date-label">{today}</p>\n          <h1>홈</h1>`,
  `          <p className="date-label">{today}</p>\n          <div className="home-title-row">\n            <h1>홈</h1>\n            <span\n              className="class-presence-count"\n              aria-label={\`현재 접속 \${presence.online}명, 반 인원 \${presence.total}명\`}\n            >\n              {presence.online}/{presence.total}\n            </span>\n          </div>`,
  'home presence label',
)

main = replaceOnce(
  main,
  `  const schoolData = useSchoolData(now)\n  const todoData = useTodos(profile)`,
  `  const schoolData = useSchoolData(now)\n  const todoData = useTodos(profile)\n  const presence = useClassPresence(profile)`,
  'presence hook usage',
)

main = replaceOnce(
  main,
  `        schoolData={schoolData}\n        todoData={todoData}\n      />`,
  `        schoolData={schoolData}\n        todoData={todoData}\n        presence={presence}\n      />`,
  'presence prop',
)

styles = replaceOnce(
  styles,
  `.home-topbar h1 {\n  font-size: 38px;\n  line-height: 1.02;\n  font-weight: 740;\n}\n`,
  `.home-topbar h1 {\n  font-size: 38px;\n  line-height: 1.02;\n  font-weight: 740;\n}\n\n.home-title-row {\n  display: flex;\n  align-items: baseline;\n  gap: 10px;\n}\n\n.class-presence-count {\n  color: var(--text-tertiary);\n  font-size: 11px;\n  font-weight: 680;\n  line-height: 1;\n  letter-spacing: 0.045em;\n  font-variant-numeric: tabular-nums;\n  transform: translateY(-2px);\n}\n`,
  'presence styles',
)

todo = replaceRegexOnce(
  todo,
  /function dateTileParts\(todo\) \{[\s\S]*?\n\}\n\nfunction dueMetaLabel/gu,
  `function dueDateLabel(todo) {\n  const [year, month, day] = String(todo.dueDate || '').split('-').map(Number)\n  if (!year || !month || !day) return String(todo.dueDate || '날짜 없음')\n  return \`${'${month}'}월 ${'${day}'}일\`\n}\n\nfunction dueMetaLabel`,
  'plain reminder date helper',
)

todo = replaceRegexOnce(
  todo,
  /function ReminderRow\(\{ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete \}\) \{[\s\S]*?\n\}\n\nexport function TodoPage/gu,
  `function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete }) {\n  const dateLabel = dueDateLabel(todo)\n  const meta = dueMetaLabel(todo, now)\n\n  return (\n    <article\n      className={\`todo-item ${'${completed ? \'is-completed\' : \'\'}'} ${'${deleting ? \'is-deleting\' : \'\'}'}\`.trim()}\n      data-reminder-id={todo.id}\n    >\n      <button\n        className="todo-check"\n        aria-label={\`${'${todo.title}'} ${'${completed ? \'완료 취소\' : \'완료\'}'}\`}\n        onClick={() => onToggle(todo.id)}\n      >\n        <span />\n      </button>\n      <div className="todo-item-main">\n        <AnimatedText as="span" className="todo-kind" value={typeLabel(todo.type)} delay={0} />\n        <AnimatedText as="strong" value={todo.title} delay={45} />\n        {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}\n      </div>\n      <div className="todo-row-actions">\n        <span className="todo-date-text">{dateLabel}</span>\n        {completed ? (\n          <button\n            className="todo-permanent-delete"\n            type="button"\n            aria-label={\`${'${todo.title}'} 영구 삭제\`}\n            onClick={() => onDelete(todo.id)}\n          >\n            삭제\n          </button>\n        ) : (\n          <button\n            className="todo-edit-button"\n            type="button"\n            aria-label={\`${'${todo.title}'} 수정\`}\n            onClick={() => onEdit(todo)}\n          >\n            수정\n          </button>\n        )}\n      </div>\n    </article>\n  )\n}\n\nexport function TodoPage`,
  'reminder row actions',
)

todoCss = replaceRegexOnce(
  todoCss,
  /\/\* Keep the original reminder row structure\.[\s\S]*?(?=@media \(prefers-reduced-motion: reduce\))/gu,
  `/* Reminder rows keep date and action in one explicit right-side rail. */\n.todo-stage5 .todo-item,\n.todo-stage5 .todo-item.is-completed {\n  position: relative;\n  grid-template-columns: 48px minmax(0, 1fr) auto;\n  min-height: 78px;\n}\n\n.todo-stage5 .todo-item-main,\n.todo-stage5 .todo-item.is-completed .todo-item-main {\n  grid-column: 2;\n  min-width: 0;\n  padding: 13px 4px 13px 0;\n  cursor: default;\n}\n\n.todo-stage5 .todo-item-main > small {\n  grid-column: 1;\n  justify-self: start;\n  font-size: 11px;\n}\n\n.todo-stage5 .todo-row-actions {\n  grid-column: 3;\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 14px;\n  min-width: 0;\n  padding: 0 16px 0 10px;\n  white-space: nowrap;\n}\n\n.todo-stage5 .todo-date-text {\n  color: var(--text-secondary);\n  font-size: 12px;\n  font-weight: 620;\n  line-height: 1;\n  letter-spacing: -0.015em;\n  font-variant-numeric: tabular-nums;\n}\n\n.todo-stage5 .todo-item.is-completed .todo-date-text {\n  opacity: 0.52;\n}\n\n.todo-stage5 .todo-edit-button,\n.todo-stage5 .todo-permanent-delete {\n  flex: none;\n  min-width: 28px;\n  padding: 8px 0;\n  border: 0;\n  background: transparent;\n  font-size: 12px;\n  font-weight: 700;\n  line-height: 1;\n  letter-spacing: -0.01em;\n  cursor: pointer;\n}\n\n.todo-stage5 .todo-edit-button {\n  color: var(--text-secondary);\n}\n\n.todo-stage5 .todo-permanent-delete {\n  grid-column: auto;\n  align-self: auto;\n  color: #d84d49;\n  opacity: 0.82;\n}\n\n.todo-stage5 .todo-edit-button:active,\n.todo-stage5 .todo-permanent-delete:active {\n  opacity: 0.52;\n}\n\n@media (max-width: 430px) {\n  .todo-stage5 .todo-item,\n  .todo-stage5 .todo-item.is-completed {\n    grid-template-columns: 44px minmax(0, 1fr) auto;\n  }\n\n  .todo-stage5 .todo-row-actions {\n    gap: 11px;\n    padding-right: 13px;\n    padding-left: 8px;\n  }\n\n  .todo-stage5 .todo-date-text,\n  .todo-stage5 .todo-edit-button,\n  .todo-stage5 .todo-permanent-delete {\n    font-size: 11px;\n  }\n}\n\n`,
  'reminder row css',
)

rules = replaceOnce(
  rules,
  `    function validPersonalTodoState() {`,
  `    function validMember() {\n      return request.resource.data.keys().hasOnly(['joinedAt'])\n        && request.resource.data.keys().hasAll(['joinedAt'])\n        && request.resource.data.joinedAt is int;\n    }\n\n    function validPresence() {\n      return request.resource.data.keys().hasOnly(['studentKey', 'lastSeenMs'])\n        && request.resource.data.keys().hasAll(['studentKey', 'lastSeenMs'])\n        && request.resource.data.studentKey is string\n        && request.resource.data.studentKey.size() >= 16\n        && request.resource.data.studentKey.size() <= 80\n        && request.resource.data.lastSeenMs is int;\n    }\n\n    function validPersonalTodoState() {`,
  'presence rule validators',
)

rules = replaceOnce(
  rules,
  `    match /students/{studentId}/todoState/{todoId} {`,
  `    match /classes/{classId}/members/{studentId} {\n      allow read: if signedIn();\n      allow create: if signedIn() && validMember();\n      allow update, delete: if false;\n    }\n\n    match /classes/{classId}/presence/{presenceId} {\n      allow read: if signedIn();\n      allow create, update: if signedIn()\n        && presenceId == request.auth.uid\n        && validPresence();\n      allow delete: if false;\n    }\n\n    match /students/{studentId}/todoState/{todoId} {`,
  'presence collection rules',
)

sw = replaceOnce(sw, "const CACHE_NAME = 'school-shell-v65'", "const CACHE_NAME = 'school-shell-v66'", 'service worker cache')

fs.writeFileSync(syncPath, sync)
fs.writeFileSync(mainPath, main)
fs.writeFileSync(todoPath, todo)
fs.writeFileSync(todoCssPath, todoCss)
fs.writeFileSync(stylesPath, styles)
fs.writeFileSync(rulesPath, rules)
fs.writeFileSync(swPath, sw)

console.log('Presence and reminder action migration applied with all guards satisfied.')
