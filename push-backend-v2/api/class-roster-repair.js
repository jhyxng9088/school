import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { classNumberFromId, recoverClassRosterUsers } from '../lib/class-roster.js'
import { classifyRosterOrphans } from '../lib/class-roster-repair.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'missing_auth',
      message: '로그인 정보를 확인하지 못했어요.',
    })
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const db = adminDb()
    const identity = await db.collection('users').doc(decoded.uid).get()
    if (!identity.exists) {
      return res.status(403).json({
        ok: false,
        error: 'identity_missing',
        message: '학생 정보를 확인하지 못했어요.',
      })
    }

    const classId = String(identity.data()?.classId || '').trim()
    if (!classNumberFromId(classId)) {
      return res.status(403).json({
        ok: false,
        error: 'invalid_class',
        message: '반 정보를 확인하지 못했어요.',
      })
    }

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

    console.info('class-roster repair completed', {
      classId,
      unresolvedBefore: unresolvedKeys.length,
      archived: classification.archive.length,
      kept: classification.keep.length,
    })

    return res.status(200).json({
      ok: true,
      archived: classification.archive.length,
      kept: classification.keep.length,
      unresolvedBefore: unresolvedKeys.length,
    })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) {
      return res.status(401).json({
        ok: false,
        error: 'invalid_auth',
        message: '로그인 정보가 만료됐어요. 앱을 다시 열어 주세요.',
      })
    }
    console.error('class-roster repair failed', { code, message: error?.message })
    return res.status(502).json({
      ok: false,
      error: code || 'class_roster_repair_failed',
      message: '반 명단 정리를 완료하지 못했어요.',
    })
  }
}
