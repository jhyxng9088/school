import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { loadReminderOriginal, safeReminderOriginalId } from '../lib/reminder-original-service.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Expose-Headers', 'X-File-Name, X-File-Size, Content-Type')
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
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인 정보를 확인하지 못했어.' })

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const db = adminDb()
    const identity = await db.collection('users').doc(decoded.uid).get()
    if (!identity.exists) return res.status(403).json({ ok: false, error: 'identity_missing', message: '학생 정보를 확인하지 못했어.' })
    const classId = String(identity.data()?.classId || '').trim()
    const originalId = safeReminderOriginalId(req.query?.id)
    const original = await loadReminderOriginal(db, classId, originalId)

    res.setHeader('Content-Type', original.mimeType)
    res.setHeader('Content-Length', String(original.size))
    res.setHeader('X-File-Name', encodeURIComponent(original.name))
    res.setHeader('X-File-Size', String(original.size))
    return res.status(200).send(original.buffer)
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어. 앱을 다시 열어줘.' })
    const status = [400, 403, 404].includes(Number(error?.status)) ? Number(error.status) : 502
    const message = status === 404
      ? '이 리마인더의 원본 사진을 찾지 못했어.'
      : status === 400
        ? '원본 사진 요청 정보가 올바르지 않아.'
        : status === 403
          ? '학생 정보를 확인하지 못했어.'
          : '원본 사진을 불러오지 못했어.'
    console.error('reminder-original failed', { code: error?.code, status: error?.status, message: error?.message })
    return res.status(status).json({ ok: false, error: code || 'reminder_original_failed', message })
  }
}
