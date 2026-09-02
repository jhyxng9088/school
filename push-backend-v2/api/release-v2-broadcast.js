import { adminDb } from '../lib/firebase-admin.js'
import { sendPush } from '../lib/push.js'

const RELEASE_ID = 's-hub-v2-20260902'
const RELEASE_COLLECTION = 'releaseBroadcasts'
const STALE_SENDING_MS = 10 * 60 * 1000

const PAYLOAD = Object.freeze({
  title: 'S-Hub가 V2로 업데이트되었습니다',
  body: '새로워진 홈, 우리 반, 게시판, 공부 기능과 개선된 알림을 확인해 보세요.',
  tag: 's-hub-v2-update-20260902',
  url: './?tab=home',
})

function setHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function recipientFromSnapshot(snapshot) {
  const data = snapshot.data() || {}
  const parts = snapshot.ref.path.split('/')
  if (parts.length !== 4 || parts[0] !== 'classes' || parts[2] !== 'pushSubscriptions') return null
  const endpoint = String(data.endpoint || '').trim()
  const p256dh = String(data.p256dh || '').trim()
  const auth = String(data.auth || '').trim()
  if (!endpoint || !p256dh || !auth) return null
  return {
    endpoint,
    p256dh,
    auth,
    refPath: snapshot.ref.path,
  }
}

async function acquireReleaseClaim(db, nowMs) {
  const ref = db.collection(RELEASE_COLLECTION).doc(RELEASE_ID)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() || {} : {}
    if (current.status === 'sent') {
      return { acquired: false, reason: 'already_sent', result: current.result || null }
    }
    const startedAt = Number(current.startedAt || 0)
    if (current.status === 'sending' && startedAt && nowMs - startedAt < STALE_SENDING_MS) {
      return { acquired: false, reason: 'in_progress', result: null }
    }
    transaction.set(ref, {
      status: 'sending',
      releaseId: RELEASE_ID,
      startedAt: nowMs,
      attempt: Number(current.attempt || 0) + 1,
    }, { merge: true })
    return { acquired: true, ref }
  })
}

export default async function handler(req, res) {
  setHeaders(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const nowMs = Date.now()
  try {
    const db = adminDb()
    const claim = await acquireReleaseClaim(db, nowMs)
    if (!claim.acquired) {
      return res.status(200).json({ ok: true, sentNow: false, reason: claim.reason, result: claim.result })
    }

    const snapshot = await db.collectionGroup('pushSubscriptions').get()
    const recipients = []
    const seenEndpoints = new Set()
    for (const doc of snapshot.docs) {
      const recipient = recipientFromSnapshot(doc)
      if (!recipient || seenEndpoints.has(recipient.endpoint)) continue
      seenEndpoints.add(recipient.endpoint)
      recipients.push(recipient)
    }

    const results = await Promise.all(recipients.map((recipient) => sendPush(db, recipient, PAYLOAD)))
    const result = {
      attempted: results.length,
      sent: results.filter((item) => item.ok).length,
      permanentFailures: results.filter((item) => !item.ok && item.permanent).length,
      transientFailures: results.filter((item) => !item.ok && !item.permanent).length,
    }

    await claim.ref.set({
      status: 'sent',
      releaseId: RELEASE_ID,
      finishedAt: Date.now(),
      result,
    }, { merge: true })

    return res.status(200).json({ ok: true, sentNow: true, releaseId: RELEASE_ID, result })
  } catch (error) {
    console.error('release V2 broadcast failed', { message: error?.message })
    return res.status(500).json({ ok: false, error: 'broadcast_failed' })
  }
}
