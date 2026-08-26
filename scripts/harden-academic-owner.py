from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    file.write_text(text.replace(old, new, 1))

# Persist the anonymous Firebase UID that actually created the event.
replace_once(
    'src/class-activity.js',
    '''    creatorStudentKey: String(value.creatorStudentKey || ''),
    creatorName: String(value.creatorName || '').slice(0, 20),
    lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),''',
    '''    creatorStudentKey: String(value.creatorStudentKey || ''),
    creatorName: String(value.creatorName || '').slice(0, 20),
    creatorUid: String(value.creatorUid || '').slice(0, 128),
    lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),''',
    'academic creator uid normalization',
)
replace_once(
    'src/class-activity.js',
    '''      creatorStudentKey: existing?.creatorStudentKey || identity.studentKey,
      creatorName: existing?.creatorName || identity.profile.name,
      lastEditedByStudentKey: identity.studentKey,''',
    '''      creatorStudentKey: existing?.creatorStudentKey || identity.studentKey,
      creatorName: existing?.creatorName || identity.profile.name,
      creatorUid: existing?.creatorUid || identity.uid,
      lastEditedByStudentKey: identity.studentKey,''',
    'academic creator uid save',
)
replace_once(
    'src/class-activity.js',
    '''  return useMemo(() => ({
    events,
    studentKey,
    saveEvent,
    deleteEvent,
  }), [events, studentKey, saveEvent, deleteEvent])''',
    '''  const uid = auth.currentUser?.uid || ''
  return useMemo(() => ({
    events,
    studentKey,
    uid,
    saveEvent,
    deleteEvent,
  }), [events, studentKey, uid, saveEvent, deleteEvent])''',
    'academic hook uid return',
)
replace_once(
    'src/class-activity.js',
    '''    if (!event || event.creatorStudentKey !== identity.studentKey) {
      throw new Error('이 일정은 처음 추가한 학생만 삭제할 수 있어.')
    }''',
    '''    if (!event || event.creatorUid !== identity.uid) {
      throw new Error('이 일정은 처음 추가한 학생만 삭제할 수 있어.')
    }''',
    'client academic owner delete check',
)

# Match the UI to the same UID-based rule, so non-owners never see an enabled delete button.
replace_once(
    'src/academic-shared.jsx',
    '  const canDelete = Boolean(editingEvent && editingEvent.creatorStudentKey === academicData.studentKey)',
    '  const canDelete = Boolean(editingEvent && academicData.uid && editingEvent.creatorUid === academicData.uid)',
    'academic delete ui uid check',
)

# Firestore rule validation and owner-only delete by auth UID.
replace_once(
    'firestore.rules',
    '''          'creatorStudentKey', 'creatorName', 'lastEditedByStudentKey', 'lastEditedByName', 'lastAction'
        ])
        && request.resource.data.keys().hasAll([
          'id', 'title', 'startDate', 'endDate', 'detail', 'createdAt', 'updatedAt',
          'creatorStudentKey', 'creatorName', 'lastEditedByStudentKey', 'lastEditedByName', 'lastAction'
        ])''',
    '''          'creatorStudentKey', 'creatorName', 'creatorUid', 'lastEditedByStudentKey', 'lastEditedByName', 'lastAction'
        ])
        && request.resource.data.keys().hasAll([
          'id', 'title', 'startDate', 'endDate', 'detail', 'createdAt', 'updatedAt',
          'creatorStudentKey', 'creatorName', 'creatorUid', 'lastEditedByStudentKey', 'lastEditedByName', 'lastAction'
        ])''',
    'academic rule creator uid keys',
)
replace_once(
    'firestore.rules',
    '''        && request.resource.data.creatorName.size() > 0
        && request.resource.data.creatorName.size() <= 20
        && request.resource.data.lastEditedByStudentKey is string''',
    '''        && request.resource.data.creatorName.size() > 0
        && request.resource.data.creatorName.size() <= 20
        && request.resource.data.creatorUid is string
        && request.resource.data.creatorUid.size() > 0
        && request.resource.data.creatorUid.size() <= 128
        && request.resource.data.lastEditedByStudentKey is string''',
    'academic rule creator uid validation',
)
replace_once(
    'firestore.rules',
    '''        && validAcademicEvent(eventId)
        && identityMatches(classId, request.resource.data.creatorStudentKey)
        && request.resource.data.creatorStudentKey == request.resource.data.lastEditedByStudentKey;''',
    '''        && validAcademicEvent(eventId)
        && request.resource.data.creatorUid == request.auth.uid
        && identityMatches(classId, request.resource.data.creatorStudentKey)
        && request.resource.data.creatorStudentKey == request.resource.data.lastEditedByStudentKey;''',
    'academic create uid rule',
)
replace_once(
    'firestore.rules',
    '''        && request.resource.data.creatorStudentKey == resource.data.creatorStudentKey
        && request.resource.data.creatorName == resource.data.creatorName
        && request.resource.data.createdAt == resource.data.createdAt
        && identityMatches(classId, request.resource.data.lastEditedByStudentKey);
      allow delete: if identityMatches(classId, resource.data.creatorStudentKey);''',
    '''        && request.resource.data.creatorStudentKey == resource.data.creatorStudentKey
        && request.resource.data.creatorName == resource.data.creatorName
        && request.resource.data.creatorUid == resource.data.creatorUid
        && request.resource.data.createdAt == resource.data.createdAt
        && identityMatches(classId, request.resource.data.lastEditedByStudentKey);
      allow delete: if signedIn() && request.auth.uid == resource.data.creatorUid;''',
    'academic update delete uid rule',
)

print('academic owner UID enforcement applied')
