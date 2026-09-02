import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { sendPush } from '../lib/push.js'

const V2_RELEASE_ID = 's-hub-v2-20260902'
const V2_RELEASE_TRIGGER = '20260902-v2-release'
const V2_RELEASE_COLLECTION = 'releaseBroadcasts'
const V2_RELEASE_STALE_MS = 10 * 60 * 1000
const V2_RELEASE_PAYLOAD = Object.freeze({
  title: 'S-Hub가 V2로 업데이트되었습니다',
  body: '새로워진 홈, 우리 반, 게시판, 공부 기능과 개선된 알림을 확인해 보세요.',
  tag: 's-hub-v2-update-20260902',
  url: './?tab=home',
})

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

function safe(value, max) {
  return String(value || '').trim().slice(0, max)
}

const DEVICE_TYPES = new Set(['iphone', 'ipad', 'android', 'desktop', 'unknown'])
const BROWSERS = new Set(['safari', 'samsung', 'chrome', 'firefox', 'edge', 'other'])
const DISPLAY_MODES = new Set(['standalone', 'browser'])

function releaseRecipient(snapshot) {
  const data = snapshot.data() || {}
  const parts = snapshot.ref.path.split('/')
  if (parts.length !== 4 || parts[0] !== 'classes' || parts[2] !== 'pushSubscriptions') return null
  const endpoint = String(data.endpoint || '').trim()
  const p256dh = String(data.p256dh || '').trim()
  const auth = String(data.auth || '').trim()
  if (!endpoint || !p256dh || !auth) return null
  return { endpoint, p256dh, auth, refPath: snapshot.ref.path }
}

async function acquireReleaseClaim(db, nowMs) {
  const ref = db.collection(V2_RELEASE_COLLECTION).doc(V2_RELEASE_ID)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() || {} : {}
    if (current.status === 'sent') {
      return { acquired: false, reason: 'already_sent', result: current.result || null }
    }
    const startedAt = Number(current.startedAt || 0)
    if (current.status === 'sending' && startedAt && nowMs - startedAt < V2_RELEASE_STALE_MS) {
      return { acquired: false, reason: 'in_progress', result: null }
    }
    transaction.set(ref, {
      status: 'sending',
      releaseId: V2_RELEASE_ID,
      startedAt: nowMs,
      attempt: Number(current.attempt || 0) + 1,
    }, { merge: true })
    return { acquired: true, ref }
  })
}

async function sendV2ReleaseBroadcast() {
  const db = adminDb()
  const claim = await acquireReleaseClaim(db, Date.now())
  if (!claim.acquired) {
    return { ok: true, sentNow: false, reason: claim.reason, result: claim.result }
  }

  const snapshot = await db.collectionGroup('pushSubscriptions').get()
  const recipients = []
  const seenEndpoints = new Set()
  for (const doc of snapshot.docs) {
    const recipient = releaseRecipient(doc)
    if (!recipient || seenEndpoints.has(recipient.endpoint)) continue
    seenEndpoints.add(recipient.endpoint)
    recipients.push(recipient)
  }

  const results = await Promise.all(recipients.map((recipient) => sendPush(db, recipient, V2_RELEASE_PAYLOAD)))
  const result = {
    attempted: results.length,
    sent: results.filter((item) => item.ok).length,
    permanentFailures: results.filter((item) => !item.ok && item.permanent).length,
    transientFailures: results.filter((item) => !item.ok && !item.permanent).length,
  }

  await claim.ref.set({
    status: 'sent',
    releaseId: V2_RELEASE_ID,
    finishedAt: Date.now(),
    result,
  }, { merge: true })

  return { ok: true, sentNow: true, releaseId: V2_RELEASE_ID, result }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET' && String(req.query?.releaseV2Broadcast || '') === V2_RELEASE_TRIGGER) {
    try {
      return res.status(200).json(await sendV2ReleaseBroadcast())
    } catch (error) {
      console.error('V2 release broadcast failed', { code: error?.code, message: error?.message })
      return res.status(500).json({ ok: false, error: 'broadcast_failed' })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: '지원하지 않는 요청이야.' })

  try {
    const token = bearerToken(req)
    if (!token) return res.status(401).json({ ok: false, message: '로그인이 필요해.' })
    const decoded = await adminAuth().verifyIdToken(token)

    const type = safe(req.body?.deviceType, 20).toLowerCase()
    const browser = safe(req.body?.browser, 20).toLowerCase()
    const displayMode = safe(req.body?.displayMode, 20).toLowerCase()
    const payload = {
      deviceType: DEVICE_TYPES.has(type) ? type : 'unknown',
      deviceLabel: safe(req.body?.deviceLabel, 50) || '알 수 없는 기기',
      platform: safe(req.body?.platform, 80),
      browser: BROWSERS.has(browser) ? browser : 'other',
      displayMode: DISPLAY_MODES.has(displayMode) ? displayMode : 'browser',
      updatedAt: Date.now(),
    }

    // One tiny admin-only document per Firebase Auth identity. No student data scan is needed.
    await adminDb().collection('adminDevices').doc(decoded.uid).set(payload, { merge: true })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('device registration failed', { code: error?.code, message: error?.message })
    return res.status(500).json({ ok: false, message: '기기 정보를 저장하지 못했어.' })
  }
}
