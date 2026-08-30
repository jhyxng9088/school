import { adminDb } from '../lib/firebase-admin.js'
import { planClassNotifications } from '../lib/planner.js'
import { acquireClaim, markClaimSent, releaseClaim } from '../lib/claims.js'
import {
  recentScheduleCheckpoints,
  scheduleLookbackMs,
  uniqueScheduledPlans,
} from '../lib/schedule-backfill.js'
import {
  academicRelevantForCheckpoints,
  candidateDateKeys,
  classDocumentFromSnapshot,
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

async function queryCollectionGroupByValues(db, collectionName, fieldName, values) {
  const cleanValues = [...new Set((values || []).map((value) => String(value || '')).filter(Boolean))]
  if (!cleanValues.length) return []

  const query = cleanValues.length === 1
    ? db.collectionGroup(collectionName).where(fieldName, '==', cleanValues[0])
    : db.collectionGroup(collectionName).where(fieldName, 'in', cleanValues)
  const snapshot = await query.get()
  return snapshot.docs
}

function pushGrouped(map, classId, value) {
  if (!classId || !value) return
  if (!map.has(classId)) map.set(classId, [])
  map.get(classId).push(value)
}

async function candidateClassData(db, checkpoints) {
  const { todoDates, academicDates } = candidateDateKeys(checkpoints)
  const [todoDocs, academicDocs] = await Promise.all([
    queryCollectionGroupByValues(db, 'todos', 'dueDate', todoDates),
    queryCollectionGroupByValues(db, 'academicEvents', 'startDate', academicDates),
  ])

  const todosByClass = new Map()
  const academicByClass = new Map()

  for (const snapshot of todoDocs) {
    const scoped = classDocumentFromSnapshot(snapshot, 'todos')
    if (!scoped || !todoRelevantForCheckpoints(scoped.value, checkpoints)) continue
    pushGrouped(todosByClass, scoped.classId, scoped.value)
  }

  for (const snapshot of academicDocs) {
    const scoped = classDocumentFromSnapshot(snapshot, 'academicEvents')
    if (!scoped || !academicRelevantForCheckpoints(scoped.value, checkpoints)) continue
    pushGrouped(academicByClass, scoped.classId, scoped.value)
  }

  const classIds = [...new Set([...todosByClass.keys(), ...academicByClass.keys()])]
  return {
    classIds,
    todosByClass,
    academicByClass,
    queriedTodoDates: todoDates,
    queriedAcademicDates: academicDates,
    candidateTodos: [...todosByClass.values()].reduce((sum, items) => sum + items.length, 0),
    candidateAcademicEvents: [...academicByClass.values()].reduce((sum, items) => sum + items.length, 0),
  }
}

async function subscriptionsForClass(db, classId) {
  const snapshot = await db.collection('classes').doc(classId).collection('pushSubscriptions').get()
  return snapshot.docs.map(subscriptionFromSnapshot).filter(Boolean)
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
    const candidateData = await candidateClassData(db, checkpoints)

    const planned = []
    let subscriptionCount = 0
    let stateDocumentsRequested = 0
    let activeClasses = 0

    for (const classId of candidateData.classIds) {
      const subscriptions = await subscriptionsForClass(db, classId)
      if (!subscriptions.length) continue
      activeClasses += 1
      subscriptionCount += subscriptions.length

      const todos = candidateData.todosByClass.get(classId) || []
      const academicEvents = candidateData.academicByClass.get(classId) || []
      const stateResult = await stateMapsForCandidates(db, subscriptions, todos)
      stateDocumentsRequested += stateResult.requested

      for (const plannerNowMs of checkpoints) {
        planned.push(...planClassNotifications({
          classId,
          subscriptions,
          todos,
          statesByStudent: stateResult.statesByStudent,
          academicEvents,
          nowMs: plannerNowMs,
        }))
      }
    }

    const uniquePlans = uniqueScheduledPlans(planned)

    if (dryRun) {
      const pushState = vapidConfigurationState()
      return res.status(200).json({
        ok: true,
        dryRun: true,
        pushConfigured: pushState.configured,
        vapidKeyPairMatches: pushState.keyPairMatches,
        subscriptions: subscriptionCount,
        classes: activeClasses,
        candidateClasses: candidateData.classIds.length,
        candidateTodos: candidateData.candidateTodos,
        candidateAcademicEvents: candidateData.candidateAcademicEvents,
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
      subscriptions: subscriptionCount,
      classes: activeClasses,
      candidateClasses: candidateData.classIds.length,
      candidateTodos: candidateData.candidateTodos,
      candidateAcademicEvents: candidateData.candidateAcademicEvents,
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