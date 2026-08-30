import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import {
  buildClassRoster,
  classNumberFromId,
  recoverClassRosterUsers,
} from '../lib/class-roster.js'
import { handlePreviewV2, isPreviewV2Resource } from '../lib/preview-v2-service.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' })

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

    const identityData = identity.data() || {}
    const classId = String(identityData.classId || '').trim()
    const studentKey = String(identityData.studentKey || '').trim()
    const name = String(identityData.name || '').trim().slice(0, 20)
    const classNumber = classNumberFromId(classId)
    if (!classNumber || !studentKey || !name) {
      return res.status(403).json({
        ok: false,
        error: 'invalid_class',
        message: '반 정보를 확인하지 못했어요.',
      })
    }

    const previewResource = String(req.method === 'GET' ? req.query?.resource || '' : req.body?.resource || '').trim()
    if (isPreviewV2Resource(previewResource)) {
      const payload = await handlePreviewV2(
        { db, classId, classNumber, studentKey, name },
        { method: req.method, resource: previewResource, body: req.body || {} },
      )
      return res.status(200).json(payload)
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' })
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
    const unresolved = roster.unresolved + recovery.unresolvedKeys.length

    if (unresolved > 0) {
      console.warn('class-roster unresolved legacy members', {
        classId,
        legacyMemberCount: memberKeys.size,
        unresolved,
        recoveredFromHistory: recovery.recoveredFromHistory.length,
      })
    }

    return res.status(200).json({
      ok: true,
      classId,
      classNumber,
      legacyMemberCount: memberKeys.size,
      total: roster.total,
      online: roster.online,
      unresolved,
      recoveredFromHistory: recovery.recoveredFromHistory.length,
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
    const requestedStatus = Number(error?.status || 0)
    if (requestedStatus >= 400 && requestedStatus < 500) {
      return res.status(requestedStatus).json({
        ok: false,
        error: code || 'preview_request_failed',
        message: String(error?.message || '테스트 요청을 처리하지 못했어요.').slice(0, 180),
      })
    }
    console.error('class-roster failed', { code, message: error?.message })
    return res.status(502).json({
      ok: false,
      error: code || 'class_roster_failed',
      message: '반 정보를 불러오지 못했어요.',
    })
  }
}
