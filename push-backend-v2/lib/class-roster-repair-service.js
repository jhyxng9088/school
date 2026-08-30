import { recoverClassRosterUsers } from './class-roster.js'
import { classifyRosterOrphans } from './class-roster-repair.js'

export async function repairClassRoster({ db, classId }) {
  const classRef = db.collection('classes').doc(classId)
  const [
    usersSnapshot,
    membersSnapshot,
    presenceSnapshot,
    activitySnapshot,
    academicSnapshot,
    pushSnapshot,
  ] = await Promise.all([
    db.collection('users').where('classId', '==', classId).get(),
    classRef.collection('members').get(),
    classRef.collection('presence').get(),
    classRef.collection('activity').get(),
    classRef.collection('academicEvents').get(),
    classRef.collection('pushSubscriptions').get(),
  ])

  const memberKeys = new Set(
    membersSnapshot.docs
      .map((snapshot) => String(snapshot.id || '').trim())
      .filter(Boolean),
  )
  const users = usersSnapshot.docs.map((snapshot) => snapshot.data() || {})
  const presence = presenceSnapshot.docs.map((snapshot) => snapshot.data() || {})
  const activities = activitySnapshot.docs.map((snapshot) => snapshot.data() || {})
  const academicEvents = academicSnapshot.docs.map((snapshot) => snapshot.data() || {})
  const pushSubscriptions = pushSnapshot.docs.map((snapshot) => snapshot.data() || {})
  const recovery = recoverClassRosterUsers({
    classId,
    memberKeys,
    users,
    activities,
    academicEvents,
  })

  const unresolvedKeys = recovery.unresolvedKeys.slice(0, 60)
  const todoStateKeys = []
  await Promise.all(unresolvedKeys.map(async (studentKey) => {
    const snapshot = await db
      .collection('students')
      .doc(studentKey)
      .collection('todoState')
      .limit(1)
      .get()
    if (!snapshot.empty) todoStateKeys.push(studentKey)
  }))

  const members = membersSnapshot.docs.map((snapshot) => ({
    studentKey: String(snapshot.id || '').trim(),
    joinedAt: Number(snapshot.data()?.joinedAt || 0),
  }))
  const nowMs = Date.now()
  const classification = classifyRosterOrphans({
    unresolvedKeys,
    members,
    users,
    presence,
    activities,
    academicEvents,
    pushSubscriptions,
    todoStateKeys,
    nowMs,
  })

  if (classification.archive.length) {
    const batch = db.batch()
    for (const item of classification.archive) {
      const archiveRef = classRef.collection('rosterArchive').doc(item.studentKey)
      batch.set(archiveRef, {
        studentKey: item.studentKey,
        joinedAt: item.joinedAt,
        archivedAt: nowMs,
        reason: 'unresolved_legacy_member',
        repairVersion: 1,
      })
      batch.delete(classRef.collection('members').doc(item.studentKey))
      if (item.lastSeenMs > 0 && item.lastSeenMs < nowMs - 2 * 60 * 1000) {
        batch.delete(classRef.collection('presence').doc(item.studentKey))
      }
    }
    await batch.commit()
  }

  return {
    archived: classification.archive.length,
    kept: classification.keep.length,
    unresolvedBefore: unresolvedKeys.length,
  }
}
