import { adminDb } from '../lib/firebase-admin.js'
import { buildClassRoster, recoverClassRosterUsers } from '../lib/class-roster.js'

const MAINTENANCE_TOKEN = 'SMBY4hmnGyXJbHfhUGC-qCY8X61SBEv16kKKgFda708'
const CLASS_ID = 'class-1'
const MARKER_ID = 'roster-orphan-20260829'

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
}

async function readRosterState(db, classRef) {
  const [usersSnapshot, membersSnapshot, presenceSnapshot, activitySnapshot, academicSnapshot] = await Promise.all([
    db.collection('users').where('classId', '==', CLASS_ID).get(),
    classRef.collection('members').get(),
    classRef.collection('presence').get(),
    classRef.collection('activity').get(),
    classRef.collection('academicEvents').get(),
  ])
  const memberKeys = new Set(membersSnapshot.docs.map((doc) => String(doc.id || '').trim()).filter(Boolean))
  const users = usersSnapshot.docs.map((doc) => doc.data() || {})
  const activities = activitySnapshot.docs.map((doc) => doc.data() || {})
  const academicEvents = academicSnapshot.docs.map((doc) => doc.data() || {})
  const presence = presenceSnapshot.docs.map((doc) => doc.data() || {})
  const recovery = recoverClassRosterUsers({
    classId: CLASS_ID,
    memberKeys,
    users,
    activities,
    academicEvents,
  })
  const roster = buildClassRoster({
    classId: CLASS_ID,
    users: recovery.users,
    presence,
    nowMs: Date.now(),
  })
  return {
    memberKeys,
    recovery,
    roster,
    unresolved: roster.unresolved + recovery.unresolvedKeys.length,
  }
}

export default async function handler(req, res) {
  setHeaders(res)
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  if (String(req.query?.token || '') !== MAINTENANCE_TOKEN) {
    return res.status(404).json({ ok: false, error: 'not_found' })
  }

  try {
    const db = adminDb()
    const classRef = db.collection('classes').doc(CLASS_ID)
    const markerRef = classRef.collection('maintenance').doc(MARKER_ID)
    const marker = await markerRef.get()

    if (marker.exists) {
      const current = await readRosterState(db, classRef)
      return res.status(200).json({
        ok: true,
        alreadyDone: true,
        memberCount: current.memberKeys.size,
        total: current.roster.total,
        unresolved: current.unresolved,
      })
    }

    const before = await readRosterState(db, classRef)
    if (
      before.memberKeys.size !== 24
      || before.roster.total !== 23
      || before.unresolved !== 1
      || before.recovery.unresolvedKeys.length !== 1
    ) {
      return res.status(409).json({
        ok: false,
        error: 'unexpected_roster_shape',
        memberCount: before.memberKeys.size,
        total: before.roster.total,
        unresolved: before.unresolved,
      })
    }

    const orphanKey = before.recovery.unresolvedKeys[0]
    const batch = db.batch()
    batch.delete(classRef.collection('members').doc(orphanKey))
    batch.delete(classRef.collection('presence').doc(orphanKey))
    batch.set(markerRef, {
      completedAt: Date.now(),
      removedCount: 1,
      expectedMembersBefore: 24,
      expectedRosterTotal: 23,
    })
    await batch.commit()

    const after = await readRosterState(db, classRef)
    if (after.memberKeys.size !== 23 || after.roster.total !== 23 || after.unresolved !== 0) {
      console.error('one-time roster orphan cleanup verification mismatch', {
        memberCount: after.memberKeys.size,
        total: after.roster.total,
        unresolved: after.unresolved,
      })
      return res.status(500).json({
        ok: false,
        error: 'verification_failed',
        memberCount: after.memberKeys.size,
        total: after.roster.total,
        unresolved: after.unresolved,
      })
    }

    console.info('one-time roster orphan cleanup completed', {
      classId: CLASS_ID,
      removedCount: 1,
      memberCountAfter: after.memberKeys.size,
      totalAfter: after.roster.total,
      unresolvedAfter: after.unresolved,
    })

    return res.status(200).json({
      ok: true,
      deleted: 1,
      memberCount: after.memberKeys.size,
      total: after.roster.total,
      unresolved: after.unresolved,
    })
  } catch (error) {
    console.error('one-time roster orphan cleanup failed', { message: error?.message, code: error?.code })
    return res.status(500).json({ ok: false, error: 'maintenance_failed' })
  }
}
