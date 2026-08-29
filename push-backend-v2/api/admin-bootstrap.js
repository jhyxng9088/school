import crypto from 'node:crypto'
import { adminAuth, adminDb } from '../lib/firebase-admin.js'

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

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth', message: '로그인이 필요해.' })

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const expected = String(process.env.ADMIN_BOOTSTRAP_SECRET || '').trim()
    const provided = String(req.body?.secret || '').trim()
    if (!expected) return res.status(503).json({ ok: false, error: 'bootstrap_not_configured', message: '서버에 관리자 부트스트랩 키가 아직 설정되지 않았어.' })
    if (!provided || !safeEqual(provided, expected)) return res.status(403).json({ ok: false, error: 'invalid_secret', message: '관리자 부트스트랩 키가 올바르지 않아.' })

    const db = adminDb()
    const existingAdmins = await db.collection('admins').limit(1).get()
    const role = existingAdmins.empty ? 'super_admin' : 'admin'
    await db.collection('admins').doc(decoded.uid).set({
      active: true,
      role,
      label: role === 'super_admin' ? 'S-Hub 최고 관리자' : 'S-Hub 관리자',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, { merge: true })

    await db.collection('adminAudit').add({
      action: 'admin_bootstrap',
      actorUid: decoded.uid,
      targetUid: decoded.uid,
      role,
      createdAt: Date.now(),
    })

    return res.status(200).json({ ok: true, role })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어.' })
    console.error('admin bootstrap failed', { code, message: error?.message })
    return res.status(500).json({ ok: false, error: 'admin_bootstrap_failed', message: '관리자 등록을 완료하지 못했어.' })
  }
}
