
import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { reminderActivityBody, reminderActivityRecipientEligible } from '../lib/activity-logic.js'
import { sendPlan } from '../lib/push.js'

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

function safeText(value, max = 120) {
  return String(value || '').trim().slice(0, max)
}

function subscriptionFromSnapshot(snapshot) {
  const data = snapshot.data() || {}
  const studentKey = safeText(data.studentKey, 80)
  const endpoint = safeText(data.endpoint, 2000)
  const p256dh = safeText(data.p256dh, 300)
  const auth = safeText(data.auth, 200)
  if (!studentKey || !endpoint || !p256dh || !auth) return null
  return {
    studentKey,
    endpoint,
    p256dh,
    auth,
    refPath: snapshot.ref.path,
  }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' })

  try {
    const db = adminDb()
    const decoded = await adminAuth().verifyIdToken(token)
    const identitySnapshot = await db.collection('users').doc(decoded.uid).get()
    if (!identitySnapshot.exists) return res.status(403).json({ ok: false, error: 'identity_missing' })

    const identity = identitySnapshot.data() || {}
    const classId = safeText(identity.classId, 30)
    const actorStudentKey = safeText(identity.studentKey, 80)
    const actorName = safeText(identity.name, 20)
    if (!classId || !actorStudentKey || !actorName) {
      return res.status(403).json({ ok: false, error: 'identity_invalid' })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const entityType = safeText(body.entityType, 30)
    const entityId = safeText(body.entityId, 120)
    const sourceId = safeText(body.sourceId, 150)
    const action = body.action === 'added' ? 'added' : 'edited'
    const updatedAt = Number(body.updatedAt || 0)
    if (entityType !== 'reminder' || !entityId || !sourceId || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_event' })
    }

    const activitySnapshot = await db.collection('classes').doc(classId).collection('activity').doc(sourceId).get()
    if (!activitySnapshot.exists) return res.status(409).json({ ok: false, error: 'activity_missing' })
    const activity = activitySnapshot.data() || {}
    if (
      String(activity.entityType || '') !== 'reminder'
      || String(activity.entityId || '') !== entityId
      || String(activity.actorStudentKey || '') !== actorStudentKey
      || String(activity.action || '') !== action
      || Number(activity.updatedAt || 0) !== updatedAt
    ) {
      return res.status(409).json({ ok: false, error: 'activity_mismatch' })
    }

    const todoSnapshot = await db.collection('classes').doc(classId).collection('todos').doc(entityId).get()
    if (!todoSnapshot.exists) return res.status(200).json({ ok: true, attempted: 0, sent: 0, suppressedHidden: 0 })
    const todo = todoSnapshot.data() || {}

    const subscriptionsSnapshot = await db.collection('classes').doc(classId).collection('pushSubscriptions').get()
    const subscriptions = subscriptionsSnapshot.docs.map(subscriptionFromSnapshot).filter(Boolean)
    const recipientStudentKeys = [...new Set(subscriptions.map((item) => item.studentKey))]
      .filter((studentKey) => studentKey && studentKey !== actorStudentKey)

    const states = new Map()
    await Promise.all(recipientStudentKeys.map(async (studentKey) => {
      const stateSnapshot = await db.collection('students').doc(studentKey).collection('todoState').doc(entityId).get()
      states.set(studentKey, stateSnapshot.exists ? (stateSnapshot.data() || {}) : null)
    }))

    let suppressedHidden = 0
    const allowedStudents = new Set()
    for (const studentKey of recipientStudentKeys) {
      const state = states.get(studentKey) || null
      if (reminderActivityRecipientEligible({ actorStudentKey, recipientStudentKey: studentKey, state })) {
        allowedStudents.add(studentKey)
      } else if (state?.hidden === true) {
        suppressedHidden += 1
      }
    }

    const recipients = subscriptions.filter((subscription) => allowedStudents.has(subscription.studentKey))
    const summary = await sendPlan(db, {
      recipients,
      payload: {
        title: 'S-Hub',
        body: reminderActivityBody({ actorName, action, title: todo.title }),
        tag: `reminder-activity-${entityId}`,
        url: './?tab=todo',
      },
    })

    return res.status(200).json({ ok: true, suppressedHidden, ...summary })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth' })
    console.error('activity-dispatch failed', error)
    return res.status(500).json({ ok: false, error: 'activity_dispatch_failed' })
  }
}
