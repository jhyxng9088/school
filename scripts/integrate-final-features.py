from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    file.write_text(text.replace(old, new, 1))


def replace_all(path, old, new, expected, label):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{label}: expected {expected} matches, found {count}')
    file.write_text(text.replace(old, new))


def append(path, content):
    with Path(path).open('a') as file:
        file.write(content)

# ---------------------------------------------------------------------------
# index.html: activate the one-time contact notice assets already in public/.
# ---------------------------------------------------------------------------
replace_once(
    'index.html',
    '    <link rel="stylesheet" href="./school-home-live.css" />\n',
    '    <link rel="stylesheet" href="./school-home-live.css" />\n    <link rel="stylesheet" href="./first-run-notice.css" />\n',
    'contact notice stylesheet',
)
replace_once(
    'index.html',
    '    <script defer src="./school-home-live.js"></script>\n',
    '    <script defer src="./school-home-live.js"></script>\n    <script defer src="./first-run-notice.js"></script>\n',
    'contact notice script',
)

# ---------------------------------------------------------------------------
# main.jsx: wire shared academics + class activity into live app.
# ---------------------------------------------------------------------------
replace_once(
    'src/main.jsx',
    "import { TodoHomePreview, TodoPage, useTodos } from './todo'\nimport { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'\n",
    "import { TodoHomePreview, TodoPage, useTodos } from './todo'\nimport { SharedAcademicPage, SharedAcademicPreview } from './academic-shared'\nimport { activityKey, activityLabel, recordClassActivity, useClassActivity, useSharedAcademic } from './class-activity'\nimport { readStudentProfile, saveStudentProfile, useClassPresence, useSharedTimetable } from './school-sync'\n",
    'main shared imports',
)
replace_once(
    'src/main.jsx',
    'function TimetablePreview({ schedule, now, configured }) {',
    'function TimetablePreview({ schedule, now, configured, activity }) {',
    'timetable preview props',
)
replace_once(
    'src/main.jsx',
    '''        {schedule.map((period) => {
          const visualState = getPeriodVisualState(now, period)
          const isNext = visualState !== 'current' && nextPeriod?.number === period.number
          return (
            <div
              className={`period-item is-${visualState} ${isNext ? 'is-next' : ''} ${period.isOverride ? 'is-override' : ''}`}
              key={period.number}
            >
              <span>{period.number}</span>
              <strong>{period.subject.trim() || '—'}</strong>
            </div>
          )
        })}''',
    '''        {schedule.map((period) => {
          const visualState = getPeriodVisualState(now, period)
          const isNext = visualState !== 'current' && nextPeriod?.number === period.number
          const day = getDayForDate(now)
          const entityType = period.isOverride ? 'timetable-override' : 'timetable-base'
          const entityId = period.isOverride ? `${dateKey(now)}:${period.number}` : `${day?.id || 'day'}:${period.number}`
          const attribution = activityLabel(activity?.[activityKey(entityType, entityId)])
          return (
            <div
              className={`period-item is-${visualState} ${isNext ? 'is-next' : ''} ${period.isOverride ? 'is-override' : ''}`}
              key={period.number}
            >
              <span>{period.number}</span>
              <strong>{period.subject.trim() || '—'}</strong>
              {attribution ? <small className="activity-attribution timetable-preview-attribution">{attribution}</small> : null}
            </div>
          )
        })}''',
    'timetable preview attribution',
)
replace_once(
    'src/main.jsx',
    'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence }) {',
    'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, academicData, activity, presence }) {',
    'home props',
)
replace_once(
    'src/main.jsx',
    '<TodoHomePreview todos={todoData.todos} now={now} />',
    '<TodoHomePreview todos={todoData.todos} now={now} activity={activity} />',
    'home reminder activity pass',
)
replace_once(
    'src/main.jsx',
    '''        <TimetablePreview
          schedule={schoolState.schedule}
          now={now}
          configured={schoolState.configured}
        />
        <AcademicPreview now={now} schoolData={schoolData} />''',
    '''        <TimetablePreview
          schedule={schoolState.schedule}
          now={now}
          configured={schoolState.configured}
          activity={activity}
        />
        <SharedAcademicPreview now={now} schoolData={schoolData} academicData={academicData} />''',
    'home shared academic preview',
)
replace_once(
    'src/main.jsx',
    'function TimetablePage({ now, weeklySchedule, overrides, onSaveWeekly, onSaveOverrides }) {',
    'function TimetablePage({ now, weeklySchedule, overrides, activity, onSaveWeekly, onSaveOverrides, onRecordActivity }) {',
    'timetable page props',
)
replace_once(
    'src/main.jsx',
    '''      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        ...period,
      })),''',
    '''      .map((period) => ({
        date,
        dayLabel: WEEKDAYS[dayIndex].label,
        attribution: activity?.[activityKey('timetable-override', `${dateKey(date)}:${period.number}`)] || null,
        ...period,
      })),''',
    'week changes attribution',
)
replace_once(
    'src/main.jsx',
    '''  function saveBaseSchedule() {
    onSaveWeekly(draft)
    setEditing(false)
  }''',
    '''  function saveBaseSchedule() {
    for (const day of WEEKDAYS) {
      for (let period = 1; period <= day.regularPeriodCount; period += 1) {
        const before = String(weeklySchedule?.[day.id]?.[period] || '')
        const after = String(draft?.[day.id]?.[period] || '')
        if (before === after) continue
        onRecordActivity('timetable-base', `${day.id}:${period}`, before.trim() ? 'edited' : 'added')
      }
    }
    onSaveWeekly(draft)
    setEditing(false)
  }''',
    'record base timetable activity',
)
replace_once(
    'src/main.jsx',
    '''    if (Object.keys(dateOverrides).length) next[changeDate] = dateOverrides
    else delete next[changeDate]

    onSaveOverrides(next)
    setChangeSubject('')''',
    '''    if (Object.keys(dateOverrides).length) next[changeDate] = dateOverrides
    else delete next[changeDate]

    const nextOverride = dateOverrides[changePeriod]
    const previousOverride = overrides?.[changeDate]?.[changePeriod]
    if (nextOverride !== undefined && nextOverride !== previousOverride) {
      onRecordActivity('timetable-override', `${changeDate}:${changePeriod}`, previousOverride !== undefined ? 'edited' : 'added')
    }
    onSaveOverrides(next)
    setChangeSubject('')''',
    'record timetable override activity',
)
replace_once(
    'src/main.jsx',
    '''                return (
                  <div className={classes} key={`${day.id}-${period.number}`}>
                    {item?.isOverride ? <span className="change-dot" aria-label="변경 시간표" /> : null}
                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                  </div>
                )''',
    '''                const entityType = item?.isOverride ? 'timetable-override' : 'timetable-base'
                const entityId = item?.isOverride ? `${dateKey(date)}:${period.number}` : `${day.id}:${period.number}`
                const attribution = activityLabel(activity?.[activityKey(entityType, entityId)])

                return (
                  <div className={classes} key={`${day.id}-${period.number}`}>
                    {item?.isOverride ? <span className="change-dot" aria-label="변경 시간표" /> : null}
                    <span className="subject">{item?.subject?.trim() || '—'}</span>
                    {attribution ? <small className="activity-attribution timetable-cell-attribution">{attribution}</small> : null}
                  </div>
                )''',
    'timetable cell attribution',
)
replace_once(
    'src/main.jsx',
    '''                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                </div>''',
    '''                  <span>{change.baseSubject.trim() || '미설정'} → {change.subject.trim() || '수업 없음'}</span>
                  {activityLabel(change.attribution) ? <small className="activity-attribution">{activityLabel(change.attribution)}</small> : null}
                </div>''',
    'week change card attribution',
)
replace_once(
    'src/main.jsx',
    '''  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)
  const presence = useClassPresence(profile)''',
    '''  const schoolData = useSchoolData(now)
  const todoData = useTodos(profile)
  const academicData = useSharedAcademic(profile)
  const activity = useClassActivity(profile)
  const presence = useClassPresence(profile)''',
    'app shell shared data',
)
replace_once(
    'src/main.jsx',
    '''        schoolData={schoolData}
        todoData={todoData}
        presence={presence}''',
    '''        schoolData={schoolData}
        todoData={todoData}
        academicData={academicData}
        activity={activity}
        presence={presence}''',
    'home shared props',
)
replace_once(
    'src/main.jsx',
    '    todo: <TodoPage now={now} todoData={todoData} />,',
    '    todo: <TodoPage now={now} todoData={todoData} activity={activity} />,',
    'todo activity prop',
)
replace_once(
    'src/main.jsx',
    '''        weeklySchedule={weeklySchedule}
        overrides={overrides}
        onSaveWeekly={commitWeeklySchedule}
        onSaveOverrides={commitOverrides}''',
    '''        weeklySchedule={weeklySchedule}
        overrides={overrides}
        activity={activity}
        onSaveWeekly={commitWeeklySchedule}
        onSaveOverrides={commitOverrides}
        onRecordActivity={(entityType, entityId, action) => {
          recordClassActivity(profile, entityType, entityId, action)
            .catch((error) => console.error('Timetable activity save failed:', error))
        }}''',
    'timetable activity props',
)
replace_once(
    'src/main.jsx',
    '    academic: <AcademicPage now={now} schoolData={schoolData} />,',
    '    academic: <SharedAcademicPage now={now} schoolData={schoolData} academicData={academicData} />,',
    'shared academic page route',
)

# ---------------------------------------------------------------------------
# todo.jsx: record who created/edited reminders and show it on home cards.
# ---------------------------------------------------------------------------
replace_once(
    'src/todo.jsx',
    "} from './school-sync'\n",
    "} from './school-sync'\nimport { activityKey, activityLabel, recordClassActivity } from './class-activity'\n",
    'todo activity imports',
)
replace_once(
    'src/todo.jsx',
    '''      writeSharedTodo(profile, nextTodo)
        .catch((error) => console.error('Shared reminder update failed:', error))''',
    '''      writeSharedTodo(profile, nextTodo)
        .then(() => recordClassActivity(profile, 'reminder', input.id, 'edited'))
        .catch((error) => console.error('Shared reminder update failed:', error))''',
    'record reminder edit',
)
replace_once(
    'src/todo.jsx',
    '''    writeSharedTodo(profile, todo)
      .catch((error) => console.error('Shared reminder create failed:', error))''',
    '''    writeSharedTodo(profile, todo)
      .then(() => recordClassActivity(profile, 'reminder', todo.id, 'added'))
      .catch((error) => console.error('Shared reminder create failed:', error))''',
    'record reminder create',
)
replace_once(
    'src/todo.jsx',
    'export function TodoHomePreview({ todos, now }) {',
    'export function TodoHomePreview({ todos, now, activity = {} }) {',
    'todo home preview props',
)
replace_once(
    'src/todo.jsx',
    '''              <div>
                <strong>{todo.title}</strong>
                <span>{typeLabel(todo.type)} · {dueLabel(todo, now)}</span>
              </div>''',
    '''              <div>
                <strong>{todo.title}</strong>
                <span>{typeLabel(todo.type)} · {dueLabel(todo, now)}</span>
                {activityLabel(activity?.[activityKey('reminder', todo.id)]) ? (
                  <small className="activity-attribution todo-home-attribution">{activityLabel(activity[activityKey('reminder', todo.id)])}</small>
                ) : null}
              </div>''',
    'todo home attribution',
)

# ---------------------------------------------------------------------------
# todo-stage5-ai.jsx: attribution in each reminder card + calm AI dots.
# ---------------------------------------------------------------------------
replace_once(
    'src/todo-stage5-ai.jsx',
    "import { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'\n",
    "import { AttachmentPicker, SummarySheet } from './reminder-summary.jsx'\nimport { activityKey, activityLabel } from './class-activity.js'\n",
    'reminder activity import',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    'function ReminderRow({ todo, now, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary }) {',
    'function ReminderRow({ todo, now, activity, completed = false, deleting = false, onToggle, onEdit, onDelete, onOpenSummary }) {',
    'reminder row activity prop',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const content = (''',
    '''  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const attribution = activityLabel(activity?.[activityKey('reminder', todo.id)])
  const content = (''',
    'reminder attribution variable',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''      <AnimatedText as="strong" value={todo.title} delay={45} />
      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
    </>''',
    '''      <AnimatedText as="strong" value={todo.title} delay={45} />
      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {attribution ? <span className="activity-attribution todo-activity-attribution">{attribution}</span> : null}
    </>''',
    'reminder attribution render',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    'export function TodoPage({ now, todoData }) {',
    'export function TodoPage({ now, todoData, activity = {} }) {',
    'todo page activity prop',
)
replace_all(
    'src/todo-stage5-ai.jsx',
    '''                  deleting={deletingId === todo.id}
                  onToggle={toggleTodo}''',
    '''                  activity={activity}
                  deleting={deletingId === todo.id}
                  onToggle={toggleTodo}''',
    2,
    'reminder row activity pass',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    "{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중…' : 'AI가 오타와 문맥을 확인하는 중…'}",
    "{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중' : 'AI가 오타와 문맥을 확인하는 중'}",
    'AI busy copy',
)

# ---------------------------------------------------------------------------
# reminder-summary: calm analysis dots + original image fade after load.
# ---------------------------------------------------------------------------
replace_once(
    'src/reminder-summary.jsx',
    "? '첨부 내용을 읽고 정리하는 중…'",
    "? '첨부 내용을 읽고 정리하는 중'",
    'attachment busy copy',
)
replace_once(
    'src/reminder-summary.jsx',
    '''function OriginalImageViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
''',
    '''function OriginalImageViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
  const [imageReady, setImageReady] = useState(false)
''',
    'original viewer image state',
)
replace_once(
    'src/reminder-summary.jsx',
    '''        <div className="reminder-original-image-wrap">
          <img src={original.url} alt={original.name || '원본 사진'} />
        </div>''',
    '''        <div className={`reminder-original-image-wrap ${imageReady ? 'is-image-ready' : ''}`}>
          <img src={original.url} alt={original.name || '원본 사진'} onLoad={() => setImageReady(true)} />
        </div>''',
    'original image fade markup',
)

# ---------------------------------------------------------------------------
# CSS additions: 70% attribution + subtle analysis motion + image fade.
# ---------------------------------------------------------------------------
append('src/academic-shared.css', '''

.todo-activity-attribution,
.todo-home-attribution,
.timetable-cell-attribution,
.timetable-preview-attribution {
  opacity: 0.7;
}

.todo-activity-attribution {
  grid-column: 1 / -1;
  overflow: hidden;
  margin-top: 1px;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-home-attribution {
  margin-top: 1px;
  font-size: 9px;
}

.timetable-cell-attribution {
  display: block;
  overflow: hidden;
  max-width: 100%;
  margin-top: 3px;
  font-size: 7.5px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timetable-preview-attribution {
  display: block;
  overflow: hidden;
  max-width: 100%;
  margin-top: 2px;
  font-size: 7.5px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
''')
append('src/todo-ai.css', '''

.reminder-ai-status.is-working::after,
.reminder-attachment-status.is-working > span::after {
  content: '...';
  display: inline-block;
  width: 1.1em;
  overflow: hidden;
  margin-left: 1px;
  color: currentColor;
  white-space: nowrap;
  clip-path: inset(0 100% 0 0);
  animation: reminder-analysis-dots 1.35s steps(4, end) infinite;
}

@keyframes reminder-analysis-dots {
  0% { clip-path: inset(0 100% 0 0); opacity: 0.45; }
  24% { clip-path: inset(0 66% 0 0); opacity: 0.62; }
  48% { clip-path: inset(0 33% 0 0); opacity: 0.8; }
  72%, 100% { clip-path: inset(0 0 0 0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .reminder-ai-status.is-working::after,
  .reminder-attachment-status.is-working > span::after {
    clip-path: none;
    animation: none;
  }
}
''')
append('src/reminder-summary.css', '''

.reminder-original-image-wrap img {
  opacity: 0;
  transform: scale(0.994);
  transition:
    opacity 480ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 620ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.reminder-original-image-wrap.is-image-ready img {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .reminder-original-image-wrap img {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
''')

# ---------------------------------------------------------------------------
# Firestore rules for users/activity/academic events. Academic delete is owner-only.
# ---------------------------------------------------------------------------
insert_point = '    function validPersonalTodoState() {'
rules_helpers = '''    function validUserIdentity() {
      return request.resource.data.keys().hasOnly(['classId', 'studentKey', 'name', 'updatedAt', 'createdAt'])
        && request.resource.data.keys().hasAll(['classId', 'studentKey', 'name', 'updatedAt', 'createdAt'])
        && request.resource.data.classId is string
        && request.resource.data.classId.size() > 0
        && request.resource.data.classId.size() <= 40
        && request.resource.data.studentKey is string
        && request.resource.data.studentKey.size() >= 16
        && request.resource.data.studentKey.size() <= 80
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 20
        && request.resource.data.updatedAt is int
        && request.resource.data.createdAt is int;
    }

    function identityMatches(classId, studentKey) {
      return signedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.classId == classId
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentKey == studentKey;
    }

    function validActivity() {
      return request.resource.data.keys().hasOnly(['entityType', 'entityId', 'actorName', 'actorStudentKey', 'action', 'updatedAt'])
        && request.resource.data.keys().hasAll(['entityType', 'entityId', 'actorName', 'actorStudentKey', 'action', 'updatedAt'])
        && request.resource.data.entityType is string
        && request.resource.data.entityType.size() > 0
        && request.resource.data.entityType.size() <= 30
        && request.resource.data.entityId is string
        && request.resource.data.entityId.size() > 0
        && request.resource.data.entityId.size() <= 120
        && request.resource.data.actorName is string
        && request.resource.data.actorName.size() > 0
        && request.resource.data.actorName.size() <= 20
        && request.resource.data.actorStudentKey is string
        && request.resource.data.actorStudentKey.size() >= 16
        && request.resource.data.actorStudentKey.size() <= 80
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
        && request.resource.data.creatorStudentKey.size() >= 16
        && request.resource.data.creatorStudentKey.size() <= 80
        && request.resource.data.creatorName is string
        && request.resource.data.creatorName.size() > 0
        && request.resource.data.creatorName.size() <= 20
        && request.resource.data.lastEditedByStudentKey is string
        && request.resource.data.lastEditedByStudentKey.size() >= 16
        && request.resource.data.lastEditedByStudentKey.size() <= 80
        && request.resource.data.lastEditedByName is string
        && request.resource.data.lastEditedByName.size() > 0
        && request.resource.data.lastEditedByName.size() <= 20
        && request.resource.data.lastAction in ['added', 'edited'];
    }

'''
replace_once('firestore.rules', insert_point, rules_helpers + insert_point, 'firestore helper insertion')
rules_matches = '''    match /users/{uid} {
      allow read: if signedIn() && uid == request.auth.uid;
      allow create, update: if signedIn() && uid == request.auth.uid && validUserIdentity();
      allow delete: if false;
    }

    match /classes/{classId}/activity/{activityId} {
      allow read: if signedIn();
      allow create, update: if signedIn()
        && validActivity()
        && identityMatches(classId, request.resource.data.actorStudentKey);
      allow delete: if false;
    }

    match /classes/{classId}/academicEvents/{eventId} {
      allow read: if signedIn();
      allow create: if signedIn()
        && validAcademicEvent(eventId)
        && identityMatches(classId, request.resource.data.creatorStudentKey)
        && request.resource.data.creatorStudentKey == request.resource.data.lastEditedByStudentKey;
      allow update: if signedIn()
        && validAcademicEvent(eventId)
        && request.resource.data.creatorStudentKey == resource.data.creatorStudentKey
        && request.resource.data.creatorName == resource.data.creatorName
        && request.resource.data.createdAt == resource.data.createdAt
        && identityMatches(classId, request.resource.data.lastEditedByStudentKey);
      allow delete: if identityMatches(classId, resource.data.creatorStudentKey);
    }

'''
replace_once('firestore.rules', '    match /classes/{classId}/todos/{todoId} {', rules_matches + '    match /classes/{classId}/todos/{todoId} {', 'firestore collection matches')

# ---------------------------------------------------------------------------
# PWA cache refresh + cache the one-time notice assets.
# ---------------------------------------------------------------------------
replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v74'", "const CACHE_NAME = 'school-shell-v75'", 'cache version')
replace_once(
    'public/sw.js',
    "'./school-home-live.css', './school-academic-supplement.js'",
    "'./school-home-live.css', './first-run-notice.css', './school-academic-supplement.js'",
    'cache notice css',
)
replace_once(
    'public/sw.js',
    "'./school-home-nav.js']",
    "'./school-home-nav.js', './first-run-notice.js']",
    'cache notice js',
)

print('final shared academic/activity/motion integration applied')
