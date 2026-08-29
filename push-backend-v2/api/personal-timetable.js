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

function normalizeSubject(value) {
  return typeof value === 'string' ? value.trim().slice(0, 20) : ''
}

const DAY_LIMITS = { mon: 6, tue: 6, wed: 7, thu: 6, fri: 7 }

function normalizeWeeklySchedule(value) {
  const next = {}
  for (const [day, limit] of Object.entries(DAY_LIMITS)) {
    next[day] = {}
    for (let period = 1; period <= limit; period += 1) {
      next[day][period] = normalizeSubject(value?.[day]?.[period])
    }
  }
  return next
}

function normalizeOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next = {}
  for (const [date, periods] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !periods || typeof periods !== 'object' || Array.isArray(periods)) continue
    const row = {}
    for (let period = 1; period <= 7; period += 1) {
      if (!Object.prototype.hasOwnProperty.call(periods, period)) continue
      row[period] = normalizeSubject(periods[period])
    }
    if (Object.keys(row).length) next[date] = row
  }
  return next
}

async function requireStudent(req) {
  const token = bearerToken(req)
  if (!token) return { error: { status: 401, body: { ok: false, error: 'missing_auth' } } }
  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const snapshot = await adminDb().collection('users').doc(decoded.uid).get()
    if (!snapshot.exists) return { error: { status: 403, body: { ok: false, error: 'student_identity_required' } } }
    const identity = snapshot.data() || {}
    const classId = String(identity.classId || '')
    const classNumber = Number(classId.replace(/^class-/, ''))
    const studentKey = String(identity.studentKey || '')
    if (!Number.isInteger(classNumber) || classNumber < 7 || classNumber > 15 || !studentKey) {
      return { error: { status: 403, body: { ok: false, error: 'personal_timetable_not_available' } } }
    }
    return { decoded, classNumber, studentKey }
  } catch {
    return { error: { status: 401, body: { ok: false, error: 'invalid_auth' } } }
  }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const student = await requireStudent(req)
  if (student.error) return res.status(student.error.status).json(student.error.body)

  const action = String(req.body?.action || 'load')
  const ref = adminDb().collection('students').doc(student.studentKey).collection('settings').doc('timetable')

  try {
    if (action === 'load') {
      const snapshot = await ref.get()
      const data = snapshot.exists ? snapshot.data() || {} : {}
      return res.status(200).json({
        ok: true,
        data: {
          weeklySchedule: normalizeWeeklySchedule(data.weeklySchedule),
          overrides: normalizeOverrides(data.overrides),
          updatedAt: Number(data.updatedAt || 0),
        },
      })
    }

    if (action === 'saveWeekly') {
      const weeklySchedule = normalizeWeeklySchedule(req.body?.weeklySchedule)
      await ref.set({ weeklySchedule, updatedAt: Date.now() }, { merge: true })
      return res.status(200).json({ ok: true, data: { weeklySchedule } })
    }

    if (action === 'saveOverrides') {
      const overrides = normalizeOverrides(req.body?.overrides)
      await ref.set({ overrides, updatedAt: Date.now() }, { merge: true })
      return res.status(200).json({ ok: true, data: { overrides } })
    }

    return res.status(400).json({ ok: false, error: 'invalid_action' })
  } catch (error) {
    console.error('personal timetable failed', { action, code: error?.code, message: error?.message })
    return res.status(500).json({ ok: false, error: 'personal_timetable_failed' })
  }
}
