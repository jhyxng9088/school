import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, value) { fs.writeFileSync(path, value) }
function replaceOnce(value, from, to, label) {
  const first = value.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`Non-unique guard: ${label}`)
  return value.slice(0, first) + to + value.slice(first + from.length)
}
function appendOnce(value, marker, addition) {
  if (value.includes(marker)) return value
  return `${value.trimEnd()}\n\n${addition.trim()}\n`
}

// main.jsx — shared academic UI + timetable attribution.
{
  const path = 'src/main.jsx'
  let value = read(path)
  value = replaceOnce(value,
`import {
  AcademicPage,
  AcademicPreview,
  MealPage as Stage3MealPage,
  MealPreview as Stage3MealPreview,
  useSchoolData,
} from './stage3'
import { TodoHomePreview, TodoPage, useTodos } from './todo'
import { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'`,
`import {
  MealPage as Stage3MealPage,
  MealPreview as Stage3MealPreview,
  useSchoolData,
} from './stage3'
import { TodoHomePreview, TodoPage, useTodos } from './todo'
import { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'
import { SharedAcademicPage, SharedAcademicPreview } from './academic-shared'
import { activityKey, activityLabel, recordClassActivity, useClassActivity, useSharedAcademic } from './class-activity'`,
  'main imports')

  value = replaceOnce(value,
`function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides }) {`,
`function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides, activity, profile }) {`,
  'timetable props')

  value = replaceOnce(value,
`  function saveBaseSchedule() {
    onSaveWeekly(draft)
    setEditing(false)
  }`,
`  function saveBaseSchedule() {
    onSaveWeekly(draft)
    recordClassActivity(profile, 'timetable', 'weekly', 'edited')
      .catch((error) => console.error('Timetable attribution save failed:', error))
    setEditing(false)
  }`,
  'base timetable attribution')

  value = replaceOnce(value,
`    const subject = changeSubject.trim()
    if (!subject) return

    const next = { ...overrides }`,
`    const subject = changeSubject.trim()
    if (!subject) return
    const activityAction = overrides?.[changeDate]?.[changePeriod] ? 'edited' : 'added'

    const next = { ...overrides }`,
  'override action')

  value = replaceOnce(value,
`    onSaveOverrides(next)
    setChangeSubject('')
    setChangeOpen(false)`,
`    onSaveOverrides(next)
    recordClassActivity(profile, 'timetable', \`${'${changeDate}'}-${'${changePeriod}'}\`, activityAction)
      .catch((error) => console.error('Timetable change attribution save failed:', error))
    setChangeSubject('')
    setChangeOpen(false)`,
  'override attribution write')

  value = replaceOnce(value,
`      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        ...period,
      })),`,
`      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        ...period,
        activity: activity?.[activityKey('timetable', \`${'${dateKey(date)}'}-${'${period.number}'}\`)] || null,
      })),`,
  'week change activity')

  value = replaceOnce(value,
`        <div className="week-legend">
          {!editing ? <span className="legend-item"><i className="legend-dot" />변경</span> : null}
          {!editing ? <span className="legend-item"><i className="legend-ring" />현재</span> : null}
          {editing ? <span>7교시는 수·금만</span> : null}
        </div>`,
`        <div className="week-legend">
          {!editing ? <span className="legend-item"><i className="legend-dot" />변경</span> : null}
          {!editing ? <span className="legend-item"><i className="legend-ring" />현재</span> : null}
          {!editing && activity?.[activityKey('timetable', 'weekly')] ? (
            <span className="activity-attribution timetable-attribution">{activityLabel(activity[activityKey('timetable', 'weekly')])}</span>
          ) : null}
          {editing ? <span>7교시는 수·금만</span> : null}
        </div>`,
  'weekly attribution display')

  value = replaceOnce(value,
`                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                </div>`,
`                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                  {change.activity ? <small className="activity-attribution">{activityLabel(change.activity)}</small> : null}
                </div>`,
  'change card attribution')

  value = replaceOnce(value,
`  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)
  const presence = useClassPresence(profile)`,
`  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)
  const presence = useClassPresence(profile)
  const academicData = useSharedAcademic(profile)
  const activity = useClassActivity(profile)`,
  'app shared hooks')

  value = replaceOnce(value,
`        <AcademicPreview now={now} schoolData={schoolData} />`,
`        <SharedAcademicPreview now={now} schoolData={schoolData} academicData={academicData} />`,
  'home academic preview')

  value = replaceOnce(value,
`        onSaveOverrides={commitOverrides}
      />`,
`        onSaveOverrides={commitOverrides}
        activity={activity}
        profile={profile}
      />`,
  'timetable shared props')

  value = replaceOnce(value,
`    academic: <AcademicPage now={now} schoolData={schoolData} />,`,
`    academic: <SharedAcademicPage now={now} schoolData={schoolData} academicData={academicData} />,`,
  'academic page')
  write(path, value)
}

// todo.jsx — record creator/editor separately from reminder content.
{
  const path = 'src/todo.jsx'
  let value = read(path)
  value = replaceOnce(value,
`} from './school-sync'

const TODO_STORAGE_KEY`,
`} from './school-sync'
import { recordClassActivity } from './class-activity'

const TODO_STORAGE_KEY`,
  'todo activity import')
  value = replaceOnce(value,
`      writeSharedTodo(profile, nextTodo)
        .catch((error) => console.error('Shared reminder update failed:', error))
      return input.id`,
`      writeSharedTodo(profile, nextTodo)
        .catch((error) => console.error('Shared reminder update failed:', error))
      recordClassActivity(profile, 'reminder', input.id, 'edited')
        .catch((error) => console.error('Reminder attribution update failed:', error))
      return input.id`,
  'todo edit attribution')
  value = replaceOnce(value,
`    writeSharedTodo(profile, todo)
      .catch((error) => console.error('Shared reminder create failed:', error))
    return todo.id`,
`    writeSharedTodo(profile, todo)
      .catch((error) => console.error('Shared reminder create failed:', error))
    recordClassActivity(profile, 'reminder', todo.id, 'added')
      .catch((error) => console.error('Reminder attribution create failed:', error))
    return todo.id`,
  'todo create attribution')
  write(path, value)
}

// todo-stage5-ai.jsx — show attribution and quiet progress dots.
{
  const path = 'src/todo-stage5-ai.jsx'
  let value = read(path)
  value = replaceOnce(value,
`import { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'
import './todo-stage5.css'`,
`import { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'
import { activityKey, activityLabel, useClassActivity } from './class-activity'
import './todo-stage5.css'`,
  'stage5 activity import')
  value = replaceOnce(value,
`function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary }) {`,
`function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary, attribution }) {`,
  'reminder row attribution prop')
  value = replaceOnce(value,
`      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
    </>`,
`      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {attribution ? <span className="activity-attribution reminder-attribution">{activityLabel(attribution)}</span> : null}
    </>`,
  'reminder attribution display')
  value = replaceOnce(value,
`  const [summaryTodo, setSummaryTodo] = useState(null)
  const pageRef = useRef(null)`,
`  const [summaryTodo, setSummaryTodo] = useState(null)
  const activity = useClassActivity()
  const pageRef = useRef(null)`,
  'stage5 activity hook')
  const rowNeedle = `                onOpenSummary={setSummaryTodo}
                key={todo.id}`
  const rowReplacement = `                onOpenSummary={setSummaryTodo}
                attribution={activity[activityKey('reminder', todo.id)] || null}
                key={todo.id}`
  const first = value.indexOf(rowNeedle)
  if (first < 0) throw new Error('Missing guard: first reminder row')
  value = value.slice(0, first) + rowReplacement + value.slice(first + rowNeedle.length)
  const second = value.indexOf(rowNeedle, first + rowReplacement.length)
  if (second < 0) throw new Error('Missing guard: second reminder row')
  value = value.slice(0, second) + rowReplacement + value.slice(second + rowNeedle.length)
  if (value.indexOf(rowNeedle) >= 0) throw new Error('Unexpected extra reminder rows')
  value = value.replaceAll('텍스트는 이해했고, 첨부 내용을 읽는 중…', '텍스트는 이해했고, 첨부 내용을 읽는 중')
  value = value.replaceAll('AI가 오타와 문맥을 확인하는 중…', 'AI가 오타와 문맥을 확인하는 중')
  write(path, value)
}

// reminder-summary.jsx — quiet animated dots + smooth original viewer close.
{
  const path = 'src/reminder-summary.jsx'
  let value = read(path)
  value = value.replaceAll('첨부 내용을 읽고 정리하는 중…', '첨부 내용을 읽고 정리하는 중')
  const start = value.indexOf('function OriginalImageViewer({ original, onClose }) {')
  const end = value.indexOf('export function SummarySheet', start)
  if (start < 0 || end < 0) throw new Error('Missing guard: original viewer block')
  const viewer = `function OriginalImageViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  function requestClose() {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, 280)
  }

  async function saveOriginal() {
    if (!original?.blob || saving) return
    setSaving(true)
    try {
      const file = new File([original.blob], original.name || '원본 사진', { type: original.blob.type || 'image/jpeg' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: original.name || '원본 사진' })
        return
      }
      const anchor = document.createElement('a')
      anchor.href = original.url
      anchor.download = original.name || '원본-사진'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Original image save failed:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!original) return null

  return (
    <div className={\`reminder-original-viewer \${closing ? 'is-closing' : ''}\`.trim()} role="dialog" aria-modal="true" aria-label="원본 사진">
      <button className="reminder-original-backdrop" type="button" aria-label="원본 사진 닫기" onClick={requestClose} />
      <div className="reminder-original-panel">
        <header>
          <strong>{original.name || '원본 사진'}</strong>
          <button className="reminder-summary-close" type="button" aria-label="닫기" onClick={requestClose}>×</button>
        </header>
        <div className="reminder-original-image-wrap">
          <img src={original.url} alt={original.name || '원본 사진'} />
        </div>
        <button className="reminder-original-save" type="button" onClick={saveOriginal} disabled={saving}>
          {saving ? '준비 중…' : '사진 저장'}
        </button>
      </div>
    </div>
  )
}

`
  value = value.slice(0, start) + viewer + value.slice(end)
  write(path, value)
}

// Reminder styles — attribution placement and subtle progress animation.
{
  const path = 'src/todo-stage5.css'
  let value = read(path)
  value = appendOnce(value, '.reminder-attribution {', `
.todo-stage5 .reminder-attribution {
  grid-column: 1 / -1;
  grid-row: 3;
  margin-top: 1px;
  font-size: 9px;
  opacity: 0.7;
}`)
  write(path, value)
}

{
  const path = 'src/reminder-summary.css'
  let value = read(path)
  value = appendOnce(value, '@keyframes reminder-quiet-dots', `
.reminder-attachment-status.is-working > span::after,
.reminder-ai-status.is-working::after {
  content: '...';
  display: inline-block;
  width: 1.25em;
  margin-left: 2px;
  overflow: hidden;
  vertical-align: bottom;
  white-space: nowrap;
  animation: reminder-quiet-dots 1.25s steps(4, end) infinite;
}

@keyframes reminder-quiet-dots {
  0% { width: 0; opacity: 0.38; }
  75%, 100% { width: 1.25em; opacity: 0.82; }
}

.reminder-original-backdrop {
  animation: reminder-original-backdrop-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.reminder-original-image-wrap img {
  animation: reminder-original-image-in 440ms cubic-bezier(0.16, 1, 0.3, 1) 55ms both;
}

.reminder-original-viewer.is-closing .reminder-original-backdrop {
  animation: reminder-original-backdrop-out 280ms cubic-bezier(0.4, 0, 1, 1) both;
}

.reminder-original-viewer.is-closing .reminder-original-panel {
  animation: reminder-original-out 280ms cubic-bezier(0.4, 0, 1, 1) both;
}

@keyframes reminder-original-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes reminder-original-backdrop-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes reminder-original-image-in {
  from { opacity: 0; transform: scale(0.992) translate3d(0, 5px, 0); }
  to { opacity: 1; transform: scale(1) translate3d(0, 0, 0); }
}

@keyframes reminder-original-out {
  from { opacity: 1; transform: scale(1) translate3d(0, 0, 0); }
  to { opacity: 0; transform: scale(0.992) translate3d(0, 7px, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .reminder-attachment-status.is-working > span::after,
  .reminder-ai-status.is-working::after,
  .reminder-original-backdrop,
  .reminder-original-image-wrap img,
  .reminder-original-viewer.is-closing .reminder-original-backdrop,
  .reminder-original-viewer.is-closing .reminder-original-panel {
    animation: none !important;
  }
}`)
  write(path, value)
}

// Timetable activity microcopy.
{
  const path = 'src/timetable.css'
  let value = read(path)
  value = appendOnce(value, '.timetable-attribution {', `
.timetable-attribution {
  margin: 0;
  font-size: 9px;
  white-space: nowrap;
}

.change-item-main .activity-attribution {
  margin-top: 4px;
  font-size: 9px;
  opacity: 0.7;
}`)
  write(path, value)
}

// First-run notice assets.
{
  const path = 'index.html'
  let value = read(path)
  value = replaceOnce(value,
`    <link rel="stylesheet" href="./school-home-live.css" />`,
`    <link rel="stylesheet" href="./school-home-live.css" />
    <link rel="stylesheet" href="./first-run-notice.css" />`,
  'notice stylesheet')
  value = replaceOnce(value,
`    <script defer src="./school-home-live.js"></script>
    <script type="module" src="/src/main.jsx"></script>`,
`    <script defer src="./school-home-live.js"></script>
    <script defer src="./first-run-notice.js"></script>
    <script type="module" src="/src/main.jsx"></script>`,
  'notice script')
  write(path, value)
}

// Firestore rules for identity, activity and shared academic events.
{
  const path = 'firestore.rules'
  let value = read(path)
  value = replaceOnce(value,
`    function validPersonalTodoState() {`,
`    function validUserIdentity() {
      return request.resource.data.keys().hasOnly(['classId', 'studentKey', 'name', 'createdAt', 'updatedAt'])
        && request.resource.data.keys().hasAll(['classId', 'studentKey', 'name', 'createdAt', 'updatedAt'])
        && request.resource.data.classId is string
        && request.resource.data.classId.size() >= 7
        && request.resource.data.classId.size() <= 20
        && request.resource.data.studentKey is string
        && request.resource.data.studentKey.size() >= 16
        && request.resource.data.studentKey.size() <= 80
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 20
        && request.resource.data.createdAt is int
        && request.resource.data.updatedAt is int;
    }

    function belongsToClass(classId) {
      return signedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.classId == classId;
    }

    function validActivity() {
      return request.resource.data.keys().hasOnly(['entityType', 'entityId', 'actorName', 'actorStudentKey', 'action', 'updatedAt'])
        && request.resource.data.keys().hasAll(['entityType', 'entityId', 'actorName', 'actorStudentKey', 'action', 'updatedAt'])
        && request.resource.data.entityType in ['reminder', 'timetable', 'academic']
        && request.resource.data.entityId is string
        && request.resource.data.entityId.size() > 0
        && request.resource.data.entityId.size() <= 120
        && request.resource.data.actorName is string
        && request.resource.data.actorName == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.name
        && request.resource.data.actorStudentKey == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentKey
        && request.resource.data.action in ['added', 'edited']
        && request.resource.data.updatedAt is int;
    }

    function validAcademicEvent(eventId) {
      return request.resource.data.keys().hasOnly([
          'id', 'title', 'startDate', 'endDate', 'detail', 'createdAt', 'updatedAt',
          'creatorStudentKey', 'creatorName', 'lastEditedByStudentKey', 'lastEditedByName', 'lastAction'
        ])
        && request.resource.data.keys().hasAll([
          'id', 'title', 'startDate', 'endDate', 'detail', 'createdAt', 'updatedAt',
          'creatorStudentKey', 'creatorName', 'lastEditedByStudentKey', 'lastEditedByName', 'lastAction'
        ])
        && request.resource.data.id == eventId
        && request.resource.data.title is string
        && request.resource.data.title.size() > 0
        && request.resource.data.title.size() <= 80
        && request.resource.data.startDate is string
        && request.resource.data.startDate.size() == 10
        && request.resource.data.endDate is string
        && request.resource.data.endDate.size() == 10
        && request.resource.data.detail is string
        && request.resource.data.detail.size() <= 500
        && request.resource.data.createdAt is int
        && request.resource.data.updatedAt is int
        && request.resource.data.creatorStudentKey is string
        && request.resource.data.creatorName is string
        && request.resource.data.lastEditedByStudentKey is string
        && request.resource.data.lastEditedByName is string
        && request.resource.data.lastAction in ['added', 'edited'];
    }

    function validPersonalTodoState() {`,
  'new rules helpers')

  value = replaceOnce(value,
`    match /classes/{classId}/todos/{todoId} {`,
`    match /users/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow create: if signedIn() && request.auth.uid == uid && validUserIdentity();
      allow update: if signedIn()
        && request.auth.uid == uid
        && validUserIdentity()
        && request.resource.data.classId == resource.data.classId
        && request.resource.data.studentKey == resource.data.studentKey
        && request.resource.data.name == resource.data.name
        && request.resource.data.createdAt == resource.data.createdAt;
      allow delete: if false;
    }

    match /classes/{classId}/activity/{activityId} {
      allow read: if belongsToClass(classId);
      allow create, update: if belongsToClass(classId) && validActivity();
      allow delete: if false;
    }

    match /classes/{classId}/academicEvents/{eventId} {
      allow read: if belongsToClass(classId);
      allow create: if belongsToClass(classId)
        && validAcademicEvent(eventId)
        && request.resource.data.creatorStudentKey == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentKey
        && request.resource.data.creatorName == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.name
        && request.resource.data.lastEditedByStudentKey == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentKey
        && request.resource.data.lastEditedByName == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.name
        && request.resource.data.lastAction == 'added';
      allow update: if belongsToClass(classId)
        && validAcademicEvent(eventId)
        && request.resource.data.creatorStudentKey == resource.data.creatorStudentKey
        && request.resource.data.creatorName == resource.data.creatorName
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.lastEditedByStudentKey == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentKey
        && request.resource.data.lastEditedByName == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.name
        && request.resource.data.lastAction == 'edited';
      allow delete: if belongsToClass(classId)
        && resource.data.creatorStudentKey == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentKey;
    }

    match /classes/{classId}/todos/{todoId} {`,
  'new collection rules')
  write(path, value)
}

// Service worker — include notice assets and guarantee installed-PWA refresh.
{
  const path = 'public/sw.js'
  let value = read(path)
  value = replaceOnce(value, `const CACHE_NAME = 'school-shell-v74'`, `const CACHE_NAME = 'school-shell-v75'`, 'service worker cache')
  value = replaceOnce(value,
`'./school-home-live.css', './school-academic-supplement.js'`,
`'./school-home-live.css', './first-run-notice.css', './school-academic-supplement.js'`,
  'notice css cache')
  value = replaceOnce(value,
`'./school-home-live.js']`,
`'./school-home-live.js', './first-run-notice.js']`,
  'notice js cache')
  write(path, value)
}

console.log('collaboration feature patch applied')
