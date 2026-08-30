import { adminDb } from '../lib/firebase-admin.js'
import { planClassNotifications } from '../lib/planner.js'
import { acquireClaim, markClaimSent, releaseClaim } from '../lib/claims.js'
import {
  recentScheduleCheckpoints,
  recoverableScheduledPlans,
  scheduleLookbackMs,
} from '../lib/schedule-backfill.js'
import {
  academicRelevantForCheckpoints,
  candidateDateKeys,
  todoRelevantForCheckpoints,
} from '../lib/scheduled-candidates.js'
import { sendPlan, vapidConfigurationState } from '../lib/push.js'

const RUNTIME_COLLECTION = 'scheduledPushRuntime'
const RUNTIME_DOCUMENT = 'reminderScheduled'
const GET_ALL_CHUNK_SIZE = 200

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

async function queryCollectionByValues(collectionRef, fieldName, values) {
  const cleanValues = [...new Set((values || []).map((value) => String(value || '')).filter(Boolean))]
  if (!cleanValues.length) return []

  const query = cleanValues.length === 1
    ? collectionRef.where(fieldName, '==', cleanValues[0])
    : collectionRef.where(fieldName, 'in', cleanValues)
  const snapshot = await query.get()
  return snapshot.docs
}

function groupSubscriptionsByClass(subscriptions) {
  const byClass = new Map()
  for (const subscription of subscriptions || []) {
    if (!byClass.has(subscription.classId)) byClass.set(subscription.classId, [])
    byClass.get(subscription.classId).push(subscription)
  }
  return byClass
}

async function stateMapsForCandidates(db, subscriptions, todos) {
  const todoIds = [...new Set((todos || []).map((todo) => String(todo?.id || '')).filter(Boolean))]
  const studentKeys = [...new Set((subscriptions || []).map((item) => String(item?.studentKey || '')).filter(Boolean))]
  const statesByStudent = new Map(studentKeys.map((studentKey) => [studentKey, new Map()]))
  if (!todoIds.length || !studentKeys.length) return { statesByStudent, requested: 0 }

  const entries = []
  for (const studentKey of studentKeys) {
    for (const todoId of todoIds) {
      entries.push({
        studentKey,
        todoId,
        ref: db.collection('students').doc(studentKey).collection('todoState').doc(todoId),
      })
    }
  }

  for (let start = 0; start < entries.length; start += GET_ALL_CHUNK_SIZE) {
    const chunk = entries.slice(start, start + GET_ALL_CHUNK_SIZE)
    const snapshots = await db.getAll(...chunk.map((entry) => entry.ref))
    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index]
      const entry = chunk[index]
      if (!snapshot?.exists || !entry) continue
      statesByStudent.get(entry.studentKey)?.set(entry.todoId, snapshot.data() || {})
    }
  }

  return { statesByStudent, requested: entries.length }
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
    const runtimeRef = db.collection(RUNTIME_COLLECTION).doc(RUNTIME_DOCUMENT)
    const runtimeSnapshot = await runtimeRef.get()
    const lastSuccessMs = Number(runtimeSnapshot.exists ? runtimeSnapshot.data()?.lastSuccessMs : 0)
    const lookbackMs = scheduleLookbackMs(lastSuccessMs, nowMs)
    const checkpoints = recentScheduleCheckpoints(nowMs, lookbackMs)
    const { todoDates, academicDates } = candidateDateKeys(checkpoints)

    const subscriptionSnapshot = await db.collectionGroup('pushSubscriptions').get()
    const subscriptions = subscriptionSnapshot.docs.map(subscriptionFromSnapshot).filter(Boolean)
    const subscriptionsByClass = groupSubscriptionsByClass(subscriptions)

    const planned = []
    let candidateClasses = 0
    let candidateTodos = 0
    let candidateAcademicEvents = 0
    let stateDocumentsRequested = 0

    for (const [classId, classSubscriptions] of subscriptionsByClass) {
      const classRef = db.collection('classes').doc(classId)
      const [todoDocs, academicDocs] = await Promise.all([
        queryCollectionByValues(classRef.collection('todos'), 'dueDate', todoDates),
        queryCollectionByValues(classRef.collection('academicEvents'), 'startDate', academicDates),
      ])

      const todos = todoDocs
        .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
        .filter((todo) => todoRelevantForCheckpoints(todo, checkpoints))
      const academicEvents = academicDocs
        .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
        .filter((event) => academicRelevantForCheckpoints(event, checkpoints))

      if (!todos.length && !academicEvents.length) continue

      candidateClasses += 1
      candidateTodos += todos.length
      candidateAcademicEvents += academicEvents.length

      const stateResult = await stateMapsForCandidates(db, classSubscriptions, todos)
      stateDocumentsRequested += stateResult.requested

      for (const plannerNowMs of checkpoints) {
        planned.push(...planClassNotifications({
          classId,
          subscriptions: classSubscriptions,
          todos,
          statesByStudent: stateResult.statesByStudent,
          academicEvents,
          nowMs: plannerNowMs,
        }))
      }
    }

    const uniquePlans = recoverableScheduledPlans(planned, nowMs)

    if (dryRun) {
      const pushState = vapidConfigurationState()
      return res.status(200).json({
        ok: true,
        dryRun: true,
        pushConfigured: pushState.configured,
        vapidKeyPairMatches: pushState.keyPairMatches,
        subscriptions: subscriptions.length,
        classes: subscriptionsByClass.size,
        candidateClasses,
        candidateTodos,
        candidateAcademicEvents,
        stateDocumentsRequested,
        checkedWindows: checkpoints.length,
        lookbackMinutes: Math.round(lookbackMs / 60_000),
        planned: uniquePlans.length,
        types: uniquePlans.reduce((acc, plan) => {
          acc[plan.type] = (acc[plan.type] || 0) + 1
          return acc
        }, {}),
      })
    }

    const totals = {
      planned: uniquePlans.length,
      claimed: 0,
      attempted: 0,
      sent: 0,
      permanentFailures: 0,
      transientFailures: 0,
    }

    for (const plan of uniquePlans) {
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

    await runtimeRef.set({
      lastSuccessMs: nowMs,
      updatedAt: Date.now(),
      checkedWindows: checkpoints.length,
    }, { merge: true })

    return res.status(200).json({
      ok: true,
      subscriptions: subscriptions.length,
      classes: subscriptionsByClass.size,
      candidateClasses,
      candidateTodos,
      candidateAcademicEvents,
      stateDocumentsRequested,
      checkedWindows: checkpoints.length,
      lookbackMinutes: Math.round(lookbackMs / 60_000),
      ...totals,
    })
  } catch (error) {
    console.error('reminder-scheduled failed', error)
    return res.status(500).json({ ok: false, error: 'scheduled_push_failed' })
  }
}