import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { buildClassRoster, classNumberFromId } from '../lib/class-roster.js'

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
    const [usersSnapshot, membersSnapshot, presenceSnapshot] = await Promise.all([
      db.collection('users').where('classId', '==', classId).get(),
      classRef.collection('members').get(),
      classRef.collection('presence').get(),
    ])

    const memberKeys = new Set(membersSnapshot.docs.map((snapshot) => String(snapshot.id || '').trim()).filter(Boolean))
    const users = usersSnapshot.docs
      .map((snapshot) => snapshot.data() || {})
      .filter((user) => memberKeys.has(String(user?.studentKey || '').trim()))
    const presence = presenceSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const roster = buildClassRoster({ classId, users, presence, nowMs: Date.now() })

    return res.status(200).json({
      ok: true,
      classId,
      classNumber,
      legacyMemberCount: memberKeys.size,
      total: roster.total,
      online: roster.online,
      unresolved: roster.unresolved,
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
