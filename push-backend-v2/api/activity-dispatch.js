import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { reminderActivityBody, reminderActivityRecipientEligible } from '../lib/activity-logic.js'
import { sendPlan } from '../lib/push.js'

const BOARD_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-board'
const STUDY_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/class-study'
const VERIFY_WINDOW_MS = 10 * 60 * 1000

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

function safeSocialText(value, max = 120) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max)
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

async function verifiedJson(url, token) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) return null
  return body
}

function withinFreshWindow(value) {
  const at = Number(value || 0)
  return Number.isFinite(at) && at > 0 && Math.abs(Date.now() - at) <= VERIFY_WINDOW_MS
}

async function verifyBoardPost({ token, postId, sectionId, actorStudentKey }) {
  const url = new URL(BOARD_API_URL)
  url.searchParams.set('section', sectionId)
  url.searchParams.set('sections', '0')
  const body = await verifiedJson(url.toString(), token)
  const posts = Array.isArray(body?.posts) ? body.posts : []
  const post = postId
    ? posts.find((item) => String(item?.id || '') === postId)
    : posts.find((item) => safeSocialText(item?.authorStudentKey, 80) === actorStudentKey && withinFreshWindow(item?.createdAt))
  if (!post) return null
  if (safeSocialText(post.authorStudentKey, 80) !== actorStudentKey) return null
  if (!withinFreshWindow(post.createdAt)) return null
  return post
}

async function verifyStudyStart({ token, subject, startedAt, actorStudentKey }) {
  const body = await verifiedJson(`${STUDY_API_URL}?scope=class`, token)
  const active = body?.me?.active && typeof body.me.active === 'object' ? body.me.active : null
  if (!active) return null
  if (safeSocialText(active.studentKey, 80) !== actorStudentKey) return null
  if (safeSocialText(active.subject, 24) !== subject) return null
  const actualStartedAt = Number(active.startedAt || 0)
  if (!withinFreshWindow(actualStartedAt) || Math.abs(actualStartedAt - startedAt) > 1500) return null
  return active
}

async function claimSocialOnce(db, classId, claimId, actorStudentKey) {
  const ref = db.collection('classes').doc(classId).collection('pushDispatchClaims').doc(claimId)
  try {
    await ref.create({ kind: 'social', actorStudentKey, createdAt: Date.now() })
    return true
  } catch (error) {
    const code = String(error?.code || '').toLowerCase()
    if (code.includes('already-exists') || code === '6') return false
    throw error
  }
}

async function dispatchSocial({ db, token, identity, body, res }) {
  const classId = safeSocialText(identity.classId, 30)
  const actorStudentKey = safeSocialText(identity.studentKey, 80)
  const actorName = safeSocialText(identity.name, 20)

  // Social push remains preview-only until V2 is explicitly approved for production.
  if (!/^preview-class-(?:[1-9]|[12][0-9]|30)$/.test(classId) || !actorStudentKey || !actorName) {
    return res.status(403).json({ ok: false, error: 'preview_identity_required' })
  }

  const kind = safeSocialText(body.kind, 30)
  let payload = null
  let claimId = ''

  if (kind === 'board-post') {
    const postId = safeSocialText(body.postId, 80)
    const sectionId = safeSocialText(body.sectionId || 'general', 32).toLowerCase()
    if ((postId && !/^[0-9a-f-]{36}$/i.test(postId)) || !/^(?:general|question|notes|custom-[0-9a-f]{6})$/.test(sectionId)) {
      return res.status(400).json({ ok: false, error: 'invalid_board_event' })
    }
    const post = await verifyBoardPost({ token, postId, sectionId, actorStudentKey })
    if (!post) return res.status(409).json({ ok: false, error: 'board_event_unverified' })
    const verifiedPostId = safeSocialText(post.id, 80)
    if (!verifiedPostId) return res.status(409).json({ ok: false, error: 'board_event_unverified' })
    claimId = `social-board-${verifiedPostId}`
    payload = {
      title: 'S-Hub',
      body: `${actorName}님이 게시판에 새 글을 올렸어요.`,
      tag: `board-post-${verifiedPostId}`,
      url: './?tab=board',
    }
  } else if (kind === 'study-start') {
    const subject = safeSocialText(body.subject, 24)
    const startedAt = Number(body.startedAt || 0)
    if (!subject || !Number.isFinite(startedAt) || startedAt <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_study_event' })
    }
    const active = await verifyStudyStart({ token, subject, startedAt, actorStudentKey })
    if (!active) return res.status(409).json({ ok: false, error: 'study_event_unverified' })
    claimId = `social-study-${actorStudentKey.slice(0, 48)}-${Math.floor(startedAt)}`
    payload = {
      title: 'S-Hub',
      body: `${actorName}님이 ${subject} 공부를 시작했어요.`,
      tag: `study-start-${actorStudentKey.slice(0, 48)}-${Math.floor(startedAt)}`,
      url: './?tab=study',
    }
  } else {
    return res.status(400).json({ ok: false, error: 'invalid_kind' })
  }

  if (!(await claimSocialOnce(db, classId, claimId, actorStudentKey))) {
    return res.status(200).json({ ok: true, duplicate: true, attempted: 0, sent: 0 })
  }

  const subscriptionsSnapshot = await db.collection('classes').doc(classId).collection('pushSubscriptions').get()
  const recipients = subscriptionsSnapshot.docs
    .map(subscriptionFromSnapshot)
    .filter(Boolean)
    .filter((subscription) => subscription.studentKey !== actorStudentKey)

  const summary = await sendPlan(db, { recipients, payload })
  return res.status(200).json({ ok: true, duplicate: false, ...summary })
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
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    if (body.kind === 'board-post' || body.kind === 'study-start') {
      return dispatchSocial({ db, token, identity, body, res })
    }

    const classId = safeText(identity.classId, 30)
    const actorStudentKey = safeText(identity.studentKey, 80)
    const actorName = safeText(identity.name, 20)
    if (!classId || !actorStudentKey || !actorName) {
      return res.status(403).json({ ok: false, error: 'identity_invalid' })
    }

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
