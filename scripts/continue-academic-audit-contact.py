from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    file.write_text(text.replace(old, new, 1))


def insert_before(path, marker, addition, label):
    replace_once(path, marker, addition + marker, label)

insert_before(
    'src/todo.jsx',
    '\n\nexport const TODO_TYPES',
    '''
function safeAudit(value) {
  if (!value || typeof value !== 'object') return null
  const name = String(value.name || '').trim().slice(0, 20)
  const studentKey = String(value.studentKey || '').trim().slice(0, 80)
  const action = value.action === 'modified' ? 'modified' : value.action === 'added' ? 'added' : ''
  const updatedAt = Number(value.updatedAt || 0)
  if (!name || studentKey.length < 16 || !action || !Number.isInteger(updatedAt) || updatedAt <= 0) return null
  return { name, studentKey, action, updatedAt }
}
''',
    'todo safe audit',
)
replace_once(
    'src/todo.jsx',
    '''    .map((todo) => {
      const summary = safeSummary(todo.summary)
      const attachment = safeAttachment(todo.attachment)
      return {
        id: String(todo.id),
        type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
        title: String(todo.title).slice(0, 80),
        dueDate: String(todo.dueDate),
        dueTime: String(todo.dueTime || ''),
        completed: Boolean(todo.completed),
        createdAt: Number(todo.createdAt || Date.now()),
        ...(summary ? { summary } : {}),
        ...(attachment ? { attachment } : {}),
      }
    })''',
    '''    .map((todo) => {
      const summary = safeSummary(todo.summary)
      const attachment = safeAttachment(todo.attachment)
      const audit = safeAudit(todo.audit)
      return {
        id: String(todo.id),
        type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
        title: String(todo.title).slice(0, 80),
        dueDate: String(todo.dueDate),
        dueTime: String(todo.dueTime || ''),
        completed: Boolean(todo.completed),
        createdAt: Number(todo.createdAt || Date.now()),
        ...(summary ? { summary } : {}),
        ...(attachment ? { attachment } : {}),
        ...(audit ? { audit } : {}),
      }
    })''',
    'todo load audit',
)
replace_once(
    'src/todo.jsx',
    '''function sharedTodoShape(todo) {
  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  return {
    id: String(todo.id),
    type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
    title: String(todo.title || '').trim().slice(0, 80),
    dueDate: String(todo.dueDate || ''),
    dueTime: String(todo.dueTime || ''),
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
  }
}''',
    '''function sharedTodoShape(todo) {
  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  const audit = safeAudit(todo.audit)
  return {
    id: String(todo.id),
    type: TODO_TYPES.some((type) => type.id === todo.type) ? todo.type : 'task',
    title: String(todo.title || '').trim().slice(0, 80),
    dueDate: String(todo.dueDate || ''),
    dueTime: String(todo.dueTime || ''),
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
    ...(audit ? { audit } : {}),
  }
}''',
    'shared todo audit',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const content = (''',
    '''  const dateLabel = dueDateLabel(todo)
  const meta = completed ? '' : dueMetaLabel(todo, now)
  const audit = todo.audit?.name ? `${todo.audit.name}이 ${todo.audit.action === 'modified' ? '수정함' : '추가함'}` : ''
  const content = (''',
    'reminder audit label',
)
replace_once(
    'src/todo-stage5-ai.jsx',
    '''      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
    </>''',
    '''      {meta ? <AnimatedText as="small" value={meta} delay={90} /> : null}
      {audit ? <span className="todo-audit">{audit}</span> : null}
    </>''',
    'reminder audit render',
)

insert_before(
    'firestore.rules',
    '    function validReminderSummary()',
    '''    function validAudit(audit) {
      return audit is map
        && audit.keys().hasOnly(['name', 'studentKey', 'action', 'updatedAt'])
        && audit.keys().hasAll(['name', 'studentKey', 'action', 'updatedAt'])
        && audit.name is string
        && audit.name.size() > 0
        && audit.name.size() <= 20
        && audit.studentKey is string
        && audit.studentKey.size() >= 16
        && audit.studentKey.size() <= 80
        && audit.action in ['added', 'modified']
        && audit.updatedAt is int;
    }

''',
    'rules audit helper',
)
replace_once(
    'firestore.rules',
    '''          'summary', 'attachment'
        ])''',
    '''          'summary', 'attachment', 'audit'
        ])''',
    'reminder audit key',
)
replace_once(
    'firestore.rules',
    '''        && request.resource.data.updatedAt is int
        && validReminderSummary()
        && validReminderAttachment();''',
    '''        && request.resource.data.updatedAt is int
        && (!request.resource.data.keys().hasAny(['audit']) || validAudit(request.resource.data.audit))
        && validReminderSummary()
        && validReminderAttachment();''',
    'reminder audit validation',
)
replace_once(
    'firestore.rules',
    '''      return request.resource.data.keys().hasOnly(['weeklySchedule', 'overrides', 'updatedAt'])
        && request.resource.data.keys().hasAll(['updatedAt'])
        && request.resource.data.get('weeklySchedule', {}) is map
        && request.resource.data.get('overrides', {}) is map
        && request.resource.data.updatedAt is int
        && request.resource.data.keys().hasAny(['weeklySchedule', 'overrides']);''',
    '''      return request.resource.data.keys().hasOnly(['weeklySchedule', 'overrides', 'weeklyMeta', 'overrideMeta', 'updatedAt'])
        && request.resource.data.keys().hasAll(['updatedAt'])
        && request.resource.data.get('weeklySchedule', {}) is map
        && request.resource.data.get('overrides', {}) is map
        && request.resource.data.get('weeklyMeta', {}) is map
        && request.resource.data.get('overrideMeta', {}) is map
        && request.resource.data.updatedAt is int
        && request.resource.data.keys().hasAny(['weeklySchedule', 'overrides']);''',
    'timetable metadata rules',
)
insert_before(
    'firestore.rules',
    '    function validPersonalTodoState()',
    '''    function validIdentity() {
      return request.resource.data.keys().hasOnly(['studentKey', 'classId', 'name', 'updatedAt'])
        && request.resource.data.keys().hasAll(['studentKey', 'classId', 'name', 'updatedAt'])
        && request.resource.data.studentKey is string
        && request.resource.data.studentKey.size() >= 16
        && request.resource.data.studentKey.size() <= 80
        && request.resource.data.classId is string
        && request.resource.data.classId.size() > 0
        && request.resource.data.classId.size() <= 40
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 20
        && request.resource.data.updatedAt is int;
    }

    function sameStudentIdentity(studentKey, classId) {
      return signedIn()
        && exists(/databases/$(database)/documents/identities/$(request.auth.uid))
        && get(/databases/$(database)/documents/identities/$(request.auth.uid)).data.studentKey == studentKey
        && get(/databases/$(database)/documents/identities/$(request.auth.uid)).data.classId == classId;
    }

    function validAcademicEvent(eventId) {
      return request.resource.data.keys().hasOnly([
          'id', 'name', 'startDate', 'endDate', 'createdByName', 'createdByStudentKey',
          'createdAt', 'updatedAt', 'audit'
        ])
        && request.resource.data.keys().hasAll([
          'id', 'name', 'startDate', 'endDate', 'createdByName', 'createdByStudentKey',
          'createdAt', 'updatedAt', 'audit'
        ])
        && request.resource.data.id == eventId
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 80
        && request.resource.data.startDate is string
        && request.resource.data.startDate.size() == 10
        && request.resource.data.endDate is string
        && request.resource.data.endDate.size() == 10
        && request.resource.data.createdByName is string
        && request.resource.data.createdByName.size() > 0
        && request.resource.data.createdByName.size() <= 20
        && request.resource.data.createdByStudentKey is string
        && request.resource.data.createdByStudentKey.size() >= 16
        && request.resource.data.createdByStudentKey.size() <= 80
        && request.resource.data.createdAt is int
        && request.resource.data.updatedAt is int
        && validAudit(request.resource.data.audit);
    }

''',
    'identity academic helper',
)
insert_before(
    'firestore.rules',
    '    match /classes/{classId}/todos/{todoId} {',
    '''    match /identities/{uid} {
      allow read: if signedIn() && uid == request.auth.uid;
      allow create, update: if signedIn() && uid == request.auth.uid && validIdentity();
      allow delete: if false;
    }

    match /classes/{classId}/academicEvents/{eventId} {
      allow read: if signedIn();
      allow create: if signedIn()
        && validAcademicEvent(eventId)
        && sameStudentIdentity(request.resource.data.createdByStudentKey, classId)
        && sameStudentIdentity(request.resource.data.audit.studentKey, classId);
      allow update: if signedIn()
        && validAcademicEvent(eventId)
        && request.resource.data.createdByStudentKey == resource.data.createdByStudentKey
        && request.resource.data.createdByName == resource.data.createdByName
        && request.resource.data.createdAt == resource.data.createdAt
        && sameStudentIdentity(request.resource.data.audit.studentKey, classId);
      allow delete: if sameStudentIdentity(resource.data.createdByStudentKey, classId);
    }

''',
    'academic rules',
)

replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v72'", "const CACHE_NAME = 'school-shell-v73'", 'cache bump')
print('academic audit continuation applied')
