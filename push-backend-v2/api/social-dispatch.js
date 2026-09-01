import { adminAuth, adminDb } from '../lib/firebase-admin.js'
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
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, max)
}

function subscriptionFromSnapshot(snapshot) {
  const data = snapshot.data() || {}
  const studentKey = safeText(data.studentKey, 80)
  const endpoint = safeText(data.endpoint, 2000)
  const p256dh = safeText(data.p256dh, 300)
  const auth = safeText(data.auth, 200)
  if (!studentKey || !endpoint || !p256dh || !auth) return null
  return { studentKey, endpoint, p256dh, auth, refPath: snapshot.ref.path }
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
  const post = Array.isArray(body?.posts) ? body.posts.find((item) => String(item?.id || '') === postId) : null
  if (!post) return null
  if (safeText(post.authorStudentKey, 80) !== actorStudentKey) return null
  if (!withinFreshWindow(post.createdAt)) return null
  return post
}

async function verifyStudyStart({ token, subject, startedAt, actorStudentKey }) {
  const body = await verifiedJson(`${STUDY_API_URL}?scope=class`, token)
  const active = body?.me?.active && typeof body.me.active === 'object' ? body.me.active : null
  if (!active) return null
  if (safeText(active.studentKey, 80) !== actorStudentKey) return null
  if (safeText(active.subject, 24) !== subject) return null
  const actualStartedAt = Number(active.startedAt || 0)
  if (!withinFreshWindow(actualStartedAt) || Math.abs(actualStartedAt - startedAt) > 1500) return null
  return active
}

async function claimOnce(db, classId, claimId, actorStudentKey) {
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
    // This endpoint is intentionally preview-scoped until the V2 UI is approved for production.
    if (!/^preview-class-(?:[1-9]|[12][0-9]|30)$/.test(classId) || !actorStudentKey || !actorName) {
      return res.status(403).json({ ok: false, error: 'preview_identity_required' })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const kind = safeText(body.kind, 30)
    let payload = null
    let claimId = ''

    if (kind === 'board-post') {
      const postId = safeText(body.postId, 80)
      const sectionId = safeText(body.sectionId || 'general', 32).toLowerCase()
      if (!/^[0-9a-f-]{36}$/i.test(postId) || !/^(?:general|question|notes|custom-[0-9a-f]{6})$/.test(sectionId)) {
        return res.status(400).json({ ok: false, error: 'invalid_board_event' })
      }
      const post = await verifyBoardPost({ token, postId, sectionId, actorStudentKey })
      if (!post) return res.status(409).json({ ok: false, error: 'board_event_unverified' })
      claimId = `social-board-${postId}`
      payload = {
        title: 'S-Hub',
        body: `${actorName}님이 게시판에 새 글을 올렸어요.`,
        tag: `board-post-${postId}`,
        url: './?tab=board',
      }
    } else if (kind === 'study-start') {
      const subject = safeText(body.subject, 24)
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

    if (!(await claimOnce(db, classId, claimId, actorStudentKey))) {
      return res.status(200).json({ ok: true, duplicate: true, attempted: 0, sent: 0 })
    }

    const subscriptionsSnapshot = await db.collection('classes').doc(classId).collection('pushSubscriptions').get()
    const recipients = subscriptionsSnapshot.docs
      .map(subscriptionFromSnapshot)
      .filter(Boolean)
      .filter((subscription) => subscription.studentKey !== actorStudentKey)

    const summary = await sendPlan(db, { recipients, payload })
    return res.status(200).json({ ok: true, duplicate: false, ...summary })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth' })
    console.error('social-dispatch failed', error)
    return res.status(500).json({ ok: false, error: 'social_dispatch_failed' })
  }
}
