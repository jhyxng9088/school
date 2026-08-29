import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import {
  buildClassRoster,
  classNumberFromId,
  recoverClassRosterUsers,
} from '../lib/class-roster.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
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
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

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
    const classNumber = classNumberFromId(classId)
    if (!classNumber) {
      return res.status(403).json({
        ok: false,
        error: 'invalid_class',
        message: '반 정보를 확인하지 못했어요.',
      })
    }

    const classRef = db.collection('classes').doc(classId)
    const [usersSnapshot, membersSnapshot, presenceSnapshot, activitySnapshot, academicSnapshot] = await Promise.all([
      db.collection('users').where('classId', '==', classId).get(),
      classRef.collection('members').get(),
      classRef.collection('presence').get(),
      classRef.collection('activity').get(),
      classRef.collection('academicEvents').get(),
    ])

    const memberKeys = new Set(
      membersSnapshot.docs
        .map((snapshot) => String(snapshot.id || '').trim())
        .filter(Boolean),
    )
    const rawUsers = usersSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const activities = activitySnapshot.docs.map((snapshot) => snapshot.data() || {})
    const academicEvents = academicSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const recovery = recoverClassRosterUsers({
      classId,
      memberKeys,
      users: rawUsers,
      activities,
      academicEvents,
    })
    const presence = presenceSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const roster = buildClassRoster({
      classId,
      users: recovery.users,
      presence,
      nowMs: Date.now(),
    })
    let legacyMemberCount = memberKeys.size
    let unresolved = roster.unresolved + recovery.unresolvedKeys.length
    let removedRequestedOrphan = false

    // One-time cleanup for the exact stale record already identified in class 1:
    // Firestore members=24, resolvable students=23, unresolved legacy member=1.
    // The guard deliberately refuses to delete anything if that exact shape changes.
    if (
      classId === 'class-1'
      && legacyMemberCount === 24
      && roster.total === 23
      && unresolved === 1
      && recovery.unresolvedKeys.length === 1
    ) {
      const orphanKey = recovery.unresolvedKeys[0]
      const batch = db.batch()
      batch.delete(classRef.collection('members').doc(orphanKey))
      batch.delete(classRef.collection('presence').doc(orphanKey))
      await batch.commit()
      memberKeys.delete(orphanKey)
      legacyMemberCount = memberKeys.size
      unresolved = 0
      removedRequestedOrphan = true
      console.info('class-roster removed requested orphan', {
        classId,
        legacyMemberCountBefore: 24,
        legacyMemberCountAfter: legacyMemberCount,
        rosterTotal: roster.total,
      })
    }

    if (unresolved > 0) {
      console.warn('class-roster unresolved legacy members', {
        classId,
        legacyMemberCount,
        unresolved,
        recoveredFromHistory: recovery.recoveredFromHistory.length,
      })
    }

    return res.status(200).json({
      ok: true,
      classId,
      classNumber,
      legacyMemberCount,
      total: roster.total,
      online: roster.online,
      unresolved,
      recoveredFromHistory: recovery.recoveredFromHistory.length,
      removedRequestedOrphan,
      members: roster.members,
      generatedAt: Date.now(),
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
    console.error('class-roster failed', { code, message: error?.message })
    return res.status(502).json({
      ok: false,
      error: code || 'class_roster_failed',
      message: '반 명단을 불러오지 못했어요.',
    })
  }
}
