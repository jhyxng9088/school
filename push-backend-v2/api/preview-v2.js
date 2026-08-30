import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import {
  koreaDateKey,
  normalizeCommentInput,
  normalizePostInput,
  normalizeStudySubject,
  safeStudyDurationMs,
  visibleStudySession,
} from '../lib/preview-v2-logic.js'

const BOARD_LIMIT = 40
const COMMENT_LIMIT = 60

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

async function authenticatedStudent(req) {
  const token = bearerToken(req)
  if (!token) {
    const error = new Error('로그인 정보를 확인하지 못했어요.')
    error.status = 401
    error.code = 'missing_auth'
    throw error
  }

  const decoded = await adminAuth().verifyIdToken(token)
  const db = adminDb()
  const identity = await db.collection('users').doc(decoded.uid).get()
  if (!identity.exists) {
    const error = new Error('학생 정보를 확인하지 못했어요.')
    error.status = 403
    error.code = 'identity_missing'
    throw error
  }

  const data = identity.data() || {}
  const classId = String(data.classId || '').trim()
  const studentKey = String(data.studentKey || '').trim()
  const name = String(data.name || '').trim().slice(0, 20)
  if (!classId || !studentKey || !name) {
    const error = new Error('반 정보를 확인하지 못했어요.')
    error.status = 403
    error.code = 'invalid_identity'
    throw error
  }

  return { db, classId, studentKey, name }
}

function boardCollection(db, classId) {
  return db.collection('classes').doc(classId).collection('previewV2Posts')
}

function studyActiveCollection(db, classId) {
  return db.collection('classes').doc(classId).collection('previewV2StudyActive')
}

function studyDailyCollection(db, classId) {
  return db.collection('classes').doc(classId).collection('previewV2StudyDaily')
}

function publicComment(value = {}) {
  return {
    id: String(value.id || ''),
    body: String(value.body || '').slice(0, 500),
    authorName: String(value.authorName || '').slice(0, 20),
    authorStudentKey: String(value.authorStudentKey || ''),
    createdAt: Number(value.createdAt || 0),
  }
}

function publicPost(snapshot) {
  const value = snapshot.data() || {}
  return {
    id: snapshot.id,
    kind: value.kind === 'question' ? 'question' : 'general',
    title: String(value.title || '').slice(0, 70),
    body: String(value.body || '').slice(0, 1200),
    authorName: String(value.authorName || '').slice(0, 20),
    authorStudentKey: String(value.authorStudentKey || ''),
    createdAt: Number(value.createdAt || 0),
    updatedAt: Number(value.updatedAt || value.createdAt || 0),
    resolved: Boolean(value.resolved),
    comments: Array.isArray(value.comments) ? value.comments.slice(-COMMENT_LIMIT).map(publicComment) : [],
  }
}

async function getBoard(student) {
  const snapshot = await boardCollection(student.db, student.classId)
    .orderBy('createdAt', 'desc')
    .limit(BOARD_LIMIT)
    .get()
  return {
    ok: true,
    resource: 'board',
    posts: snapshot.docs.map(publicPost),
    generatedAt: Date.now(),
  }
}

async function createPost(student, body) {
  const input = normalizePostInput(body)
  const now = Date.now()
  const ref = boardCollection(student.db, student.classId).doc()
  await ref.set({
    ...input,
    authorName: student.name,
    authorStudentKey: student.studentKey,
    createdAt: now,
    updatedAt: now,
    resolved: false,
    comments: [],
  })
  return { ok: true, post: publicPost(await ref.get()) }
}

async function addComment(student, body) {
  const postId = String(body.postId || '').trim().slice(0, 120)
  const commentBody = normalizeCommentInput(body.body)
  if (!postId) throw new Error('게시글을 찾지 못했어요.')
  const ref = boardCollection(student.db, student.classId).doc(postId)
  const now = Date.now()
  const comment = {
    id: `${now.toString(36)}-${student.studentKey.slice(-6)}`,
    body: commentBody,
    authorName: student.name,
    authorStudentKey: student.studentKey,
    createdAt: now,
  }

  await student.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new Error('게시글이 이미 삭제됐어요.')
    const value = snapshot.data() || {}
    const comments = Array.isArray(value.comments) ? value.comments.slice(-(COMMENT_LIMIT - 1)) : []
    transaction.update(ref, { comments: [...comments, comment], updatedAt: now })
  })
  return { ok: true, post: publicPost(await ref.get()) }
}

async function resolveQuestion(student, body) {
  const postId = String(body.postId || '').trim().slice(0, 120)
  if (!postId) throw new Error('게시글을 찾지 못했어요.')
  const ref = boardCollection(student.db, student.classId).doc(postId)
  await student.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new Error('게시글이 이미 삭제됐어요.')
    const value = snapshot.data() || {}
    if (value.kind !== 'question') throw new Error('질문 글만 해결 처리할 수 있어요.')
    if (String(value.authorStudentKey || '') !== student.studentKey) {
      const error = new Error('질문을 올린 사람만 해결 처리할 수 있어요.')
      error.status = 403
      throw error
    }
    transaction.update(ref, { resolved: true, updatedAt: Date.now() })
  })
  return { ok: true, post: publicPost(await ref.get()) }
}

async function getStudy(student) {
  const now = Date.now()
  const date = koreaDateKey(now)
  const [activeSnapshot, dailySnapshot] = await Promise.all([
    studyActiveCollection(student.db, student.classId).get(),
    studyDailyCollection(student.db, student.classId).where('date', '==', date).get(),
  ])

  const active = activeSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
    .filter((value) => visibleStudySession(value, now))
    .map((value) => ({
      studentKey: value.id,
      name: String(value.name || '').slice(0, 20),
      subject: String(value.subject || '공부').slice(0, 24),
      startedAt: Number(value.startedAt || 0),
      heartbeatAt: Number(value.heartbeatAt || 0),
    }))
    .sort((a, b) => a.startedAt - b.startedAt)

  const totals = dailySnapshot.docs
    .map((snapshot) => ({ studentKey: String(snapshot.data()?.studentKey || snapshot.id), ...(snapshot.data() || {}) }))
    .map((value) => ({
      studentKey: String(value.studentKey || ''),
      name: String(value.name || '').slice(0, 20),
      totalMs: Math.max(0, Number(value.totalMs || 0)),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)

  return {
    ok: true,
    resource: 'study',
    date,
    me: student.studentKey,
    active,
    totals,
    generatedAt: now,
  }
}

async function startStudy(student, body) {
  const ref = studyActiveCollection(student.db, student.classId).doc(student.studentKey)
  const existing = await ref.get()
  const now = Date.now()
  if (existing.exists && visibleStudySession(existing.data(), now)) {
    return { ok: true, alreadyActive: true, session: { studentKey: student.studentKey, ...existing.data() } }
  }
  const session = {
    name: student.name,
    subject: normalizeStudySubject(body.subject),
    startedAt: now,
    heartbeatAt: now,
  }
  await ref.set(session)
  return { ok: true, session: { studentKey: student.studentKey, ...session } }
}

async function heartbeatStudy(student) {
  const ref = studyActiveCollection(student.db, student.classId).doc(student.studentKey)
  const snapshot = await ref.get()
  if (!snapshot.exists) return { ok: true, active: false }
  const now = Date.now()
  await ref.update({ heartbeatAt: now })
  return { ok: true, active: true, heartbeatAt: now }
}

async function stopStudy(student) {
  const activeRef = studyActiveCollection(student.db, student.classId).doc(student.studentKey)
  const now = Date.now()
  const date = koreaDateKey(now)
  const dailyRef = studyDailyCollection(student.db, student.classId).doc(`${date}_${student.studentKey}`)
  let addedMs = 0

  await student.db.runTransaction(async (transaction) => {
    const [activeSnapshot, dailySnapshot] = await Promise.all([
      transaction.get(activeRef),
      transaction.get(dailyRef),
    ])
    if (!activeSnapshot.exists) return
    const active = activeSnapshot.data() || {}
    addedMs = safeStudyDurationMs(active.startedAt, now, active.heartbeatAt)
    const previous = dailySnapshot.exists ? Number(dailySnapshot.data()?.totalMs || 0) : 0
    transaction.set(dailyRef, {
      date,
      studentKey: student.studentKey,
      name: student.name,
      totalMs: Math.max(0, previous) + addedMs,
      updatedAt: now,
    })
    transaction.delete(activeRef)
  })

  return { ok: true, addedMs, date }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  try {
    const student = await authenticatedStudent(req)
    const resource = String(req.method === 'GET' ? req.query?.resource : req.body?.resource || '').trim()

    if (req.method === 'GET') {
      if (resource === 'board') return res.status(200).json(await getBoard(student))
      if (resource === 'study') return res.status(200).json(await getStudy(student))
      return res.status(400).json({ ok: false, error: 'invalid_resource' })
    }

    const action = String(req.body?.action || '').trim()
    if (resource === 'board') {
      if (action === 'create') return res.status(200).json(await createPost(student, req.body || {}))
      if (action === 'comment') return res.status(200).json(await addComment(student, req.body || {}))
      if (action === 'resolve') return res.status(200).json(await resolveQuestion(student, req.body || {}))
    }
    if (resource === 'study') {
      if (action === 'start') return res.status(200).json(await startStudy(student, req.body || {}))
      if (action === 'heartbeat') return res.status(200).json(await heartbeatStudy(student))
      if (action === 'stop') return res.status(200).json(await stopStudy(student))
    }
    return res.status(400).json({ ok: false, error: 'invalid_action' })
  } catch (error) {
    const authCode = String(error?.code || '')
    if (authCode.startsWith('auth/')) {
      return res.status(401).json({ ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어요. 앱을 다시 열어 주세요.' })
    }
    const status = Number(error?.status || 0)
    console.error('preview-v2 failed', { code: authCode, message: error?.message })
    return res.status(status >= 400 && status < 600 ? status : 400).json({
      ok: false,
      error: authCode || 'preview_v2_failed',
      message: String(error?.message || '테스트 기능을 처리하지 못했어요.').slice(0, 180),
    })
  }
}
