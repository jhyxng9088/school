import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { classNumberFromId } from '../lib/class-roster.js'

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
    return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어요.' })
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const identity = await adminDb().collection('users').doc(decoded.uid).get()
    if (!identity.exists) {
      return res.status(403).json({ ok: false, error: 'identity_missing', message: '학생 정보를 확인하지 못했어요.' })
    }

    const value = identity.data() || {}
    const classId = String(value.classId || '').trim()
    const classNumber = classNumberFromId(classId)
    const studentKey = String(value.studentKey || '').trim()
    const name = String(value.name || '').trim().slice(0, 20)
    if (!classNumber || !studentKey || !name) {
      return res.status(403).json({ ok: false, error: 'invalid_identity', message: '학생 정보를 확인하지 못했어요.' })
    }

    return res.status(200).json({
      ok: true,
      uid: String(decoded.uid || ''),
      classId,
      classNumber,
      studentKey,
      name,
    })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) {
      return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어요. 앱을 다시 열어 주세요.' })
    }
    console.error('board identity failed', { code, message: error?.message })
    return res.status(502).json({ ok: false, error: code || 'board_identity_failed', message: '학생 정보를 확인하지 못했어요.' })
  }
}
