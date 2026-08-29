// Deployment retry marker: no runtime behavior change.
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

function safeText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max)
}

function cleanValue(value, depth = 0) {
  if (depth > 6 || value == null) return value == null ? null : String(value)
  if (typeof value === 'string') return value.slice(0, 5000)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value?.toDate === 'function') {
    try { return value.toDate().toISOString() } catch { return String(value) }
  }
  if (Array.isArray(value)) return value.slice(0, 300).map((item) => cleanValue(item, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value).slice(0, 300)) out[safeText(key, 100)] = cleanValue(item, depth + 1)
    return out
  }
  return String(value)
}

async function requireAdmin(req) {
  const token = bearerToken(req)
  if (!token) return { error: { status: 401, body: { ok: false, error: 'missing_auth', message: '로그인이 필요해.' } } }
  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const snapshot = await adminDb().collection('admins').doc(decoded.uid).get()
    if (!snapshot.exists || snapshot.data()?.active !== true) {
      return { error: { status: 403, body: { ok: false, error: 'admin_required', message: '관리자 권한이 필요해.' } } }
    }
    return { decoded }
  } catch {
    return { error: { status: 401, body: { ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어.' } } }
  }
}

function serializeDocs(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...cleanValue(doc.data() || {}) }))
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.error.status).json(auth.error.body)

  const classId = safeText(req.body?.classId, 80)
  if (!/^class-[A-Za-z0-9_-]{1,40}$/.test(classId)) {
    return res.status(400).json({ ok: false, error: 'invalid_class', message: '반 식별자가 올바르지 않아.' })
  }

  try {
    const db = adminDb()
    const classRef = db.collection('classes').doc(classId)
    const [todos, academics, timetable] = await Promise.all([
      classRef.collection('todos').get(),
      classRef.collection('academicEvents').get(),
      classRef.collection('settings').doc('timetable').get(),
    ])

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        reminders: serializeDocs(todos),
        academicEvents: serializeDocs(academics),
        timetable: timetable.exists ? { id: timetable.id, ...cleanValue(timetable.data() || {}) } : null,
      },
    })
  } catch (error) {
    console.error('admin class details failed', { code: error?.code, message: error?.message })
    return res.status(500).json({ ok: false, error: 'class_details_failed', message: '반 상세 데이터를 불러오지 못했어.' })
  }
}
