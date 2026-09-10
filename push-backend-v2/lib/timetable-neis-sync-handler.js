import { adminAuth, adminDb } from './firebase-admin.js'
import { classNumberFromId } from './class-roster.js'
import { buildNeisTimetableSyncState } from './timetable-neis-policy.js'

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

async function requireStudent(req) {
  const token = bearerToken(req)
  if (!token) return { error: { status: 401, body: { ok: false, error: 'missing_auth' } } }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const snapshot = await adminDb().collection('users').doc(decoded.uid).get()
    if (!snapshot.exists) return { error: { status: 403, body: { ok: false, error: 'student_identity_required' } } }

    const identity = snapshot.data() || {}
    const classId = String(identity.classId || '')
    const classNumber = classNumberFromId(classId)
    if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 30) {
      return { error: { status: 403, body: { ok: false, error: 'invalid_class' } } }
    }

    return { decoded, classId, classNumber }
  } catch {
    return { error: { status: 401, body: { ok: false, error: 'invalid_auth' } } }
  }
}

function countManualOverrides(value) {
  return Object.values(value || {})
    .flatMap((periods) => Object.keys(periods || {}))
    .length
}

export default async function handleTimetableNeisSync(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const student = await requireStudent(req)
  if (student.error) return res.status(student.error.status).json(student.error.body)

  const incomingSchedule = req.body?.weeklySchedule
  if (!incomingSchedule || typeof incomingSchedule !== 'object' || Array.isArray(incomingSchedule)) {
    return res.status(400).json({ ok: false, error: 'invalid_timetable' })
  }

  const lastClientSyncAt = Number(req.body?.lastClientSyncAt || 0)
  const db = adminDb()
  const classRef = db.collection('classes').doc(student.classId)
  const timetableRef = classRef.collection('settings').doc('timetable')
  const metadataRef = classRef.collection('settings').doc('timetableNeisState')
  const now = Date.now()

  try {
    const state = await db.runTransaction(async (transaction) => {
      const [timetableSnapshot, metadataSnapshot] = await Promise.all([
        transaction.get(timetableRef),
        transaction.get(metadataRef),
      ])
      const timetableData = timetableSnapshot.exists ? timetableSnapshot.data() || {} : {}
      const metadata = metadataSnapshot.exists ? metadataSnapshot.data() || {} : {}
      const next = buildNeisTimetableSyncState({
        timetableData,
        metadata,
        neisWeeklySchedule: incomingSchedule,
        lastClientSyncAt,
      })

      transaction.set(timetableRef, {
        weeklySchedule: next.weeklySchedule,
        updatedAt: now,
      }, { merge: true })
      transaction.set(metadataRef, {
        neisWeeklySchedule: next.neisWeeklySchedule,
        manualWeeklyOverrides: next.manualWeeklyOverrides,
        updatedAt: now,
      }, { merge: true })

      return next
    })

    return res.status(200).json({
      ok: true,
      classNumber: student.classNumber,
      manualOverrideCount: countManualOverrides(state.manualWeeklyOverrides),
      updatedAt: now,
    })
  } catch (error) {
    console.error('NEIS timetable server sync failed', {
      classId: student.classId,
      code: error?.code,
      message: error?.message,
    })
    return res.status(500).json({ ok: false, error: 'timetable_neis_sync_failed' })
  }
}
