import { adminDb } from '../lib/firebase-admin.js'
import { planClassNotifications } from '../lib/planner.js'
import { acquireClaim, markClaimSent, releaseClaim } from '../lib/claims.js'
import { sendPlan } from '../lib/push.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-cron-secret')
  res.setHeader('Cache-Control', 'no-store')
}

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return true
  const direct = String(req.headers['x-cron-secret'] || '')
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return direct === secret || bearer === secret
}

function subscriptionFromSnapshot(snapshot) {
  const data = snapshot.data() || {}
  const parts = snapshot.ref.path.split('/')
  if (parts.length !== 4 || parts[0] !== 'classes' || parts[2] !== 'pushSubscriptions') return null
  const classId = parts[1]
  const studentKey = String(data.studentKey || '')
  const endpoint = String(data.endpoint || '')
  const p256dh = String(data.p256dh || '')
  const auth = String(data.auth || '')
  if (!classId || !studentKey || !endpoint || !p256dh || !auth) return null
  return {
    id: snapshot.id,
    classId,
    studentKey,
    endpoint,
    p256dh,
    auth,
    refPath: snapshot.ref.path,
  }
}

async function classData(db, classId, subscriptions) {
  const studentKeys = [...new Set(subscriptions.map((item) => item.studentKey).filter(Boolean))]
  const [todosSnapshot, academicSnapshot, stateSnapshots] = await Promise.all([
    db.collection('classes').doc(classId).collection('todos').get(),
    db.collection('classes').doc(classId).collection('academicEvents').get(),
    Promise.all(studentKeys.map(async (studentKey) => ({
      studentKey,
      snapshot: await db.collection('students').doc(studentKey).collection('todoState').get(),
    }))),
  ])

  const todos = todosSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
  const academicEvents = academicSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
  const statesByStudent = new Map()
  for (const { studentKey, snapshot } of stateSnapshots) {
    statesByStudent.set(studentKey, new Map(snapshot.docs.map((doc) => [doc.id, doc.data() || {}])))
  }
  return { todos, academicEvents, statesByStudent }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

  const dryRun = String(req.query?.dryRun || '') === '1'
  const nowMs = Date.now()

  try {
    const db = adminDb()
    const subscriptionSnapshot = await db.collectionGroup('pushSubscriptions').get()
    const subscriptions = subscriptionSnapshot.docs.map(subscriptionFromSnapshot).filter(Boolean)
    const byClass = new Map()
    for (const subscription of subscriptions) {
      if (!byClass.has(subscription.classId)) byClass.set(subscription.classId, [])
      byClass.get(subscription.classId).push(subscription)
    }

    const planned = []
    for (const [classId, classSubscriptions] of byClass) {
      const data = await classData(db, classId, classSubscriptions)
      planned.push(...planClassNotifications({
        classId,
        subscriptions: classSubscriptions,
        todos: data.todos,
        statesByStudent: data.statesByStudent,
        academicEvents: data.academicEvents,
        nowMs,
      }))
    }

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        subscriptions: subscriptions.length,
        classes: byClass.size,
        planned: planned.length,
        types: planned.reduce((acc, plan) => {
          acc[plan.type] = (acc[plan.type] || 0) + 1
          return acc
        }, {}),
      })
    }

    const totals = {
      planned: planned.length,
      claimed: 0,
      attempted: 0,
      sent: 0,
      permanentFailures: 0,
      transientFailures: 0,
    }

    for (const plan of planned) {
      const { acquired, ref } = await acquireClaim(db, plan.key, {
        type: plan.type,
        studentKey: String(plan.studentKey || ''),
      }, nowMs)
      if (!acquired) continue
      totals.claimed += 1

      const summary = await sendPlan(db, plan)
      totals.attempted += summary.attempted
      totals.sent += summary.sent
      totals.permanentFailures += summary.permanentFailures
      totals.transientFailures += summary.transientFailures

      if (summary.sent > 0 || summary.attempted === 0) {
        await markClaimSent(ref, summary, Date.now())
      } else {
        await releaseClaim(ref)
      }
    }

    return res.status(200).json({
      ok: true,
      subscriptions: subscriptions.length,
      classes: byClass.size,
      ...totals,
    })
  } catch (error) {
    console.error('reminder-scheduled failed', error)
    return res.status(500).json({ ok: false, error: 'scheduled_push_failed' })
  }
}
