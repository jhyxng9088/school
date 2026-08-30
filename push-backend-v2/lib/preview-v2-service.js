import {
  koreaDateKey,
  normalizeCommentInput,
  normalizePostInput,
  normalizeStudySubject,
  safeStudyDurationMs,
  visibleStudySession,
} from './preview-v2-logic.js'

const BOARD_LIMIT = 40
const COMMENT_LIMIT = 60

function boardCollection(student) {
  return student.db.collection('classes').doc(student.classId).collection('previewV2Posts')
}

function studyActiveCollection(student) {
  return student.db.collection('classes').doc(student.classId).collection('previewV2StudyActive')
}

function studyDailyCollection(student) {
  return student.db.collection('classes').doc(student.classId).collection('previewV2StudyDaily')
}

function studyGlobalDailyCollection(student) {
  return student.db.collection('previewV2StudyGlobalDaily')
}

function globalStudyDocId(student, date, studentKey = student.studentKey) {
  const classPart = String(student.classId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  const studentPart = String(studentKey || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
  return `${date}_${classPart}_${studentPart}`
}

function globalStudyRef(student, date, studentKey = student.studentKey) {
  return studyGlobalDailyCollection(student).doc(globalStudyDocId(student, date, studentKey))
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
  const snapshot = await boardCollection(student)
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
  const ref = boardCollection(student).doc()
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
  const ref = boardCollection(student).doc(postId)
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
  const ref = boardCollection(student).doc(postId)
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

function publicStudyTotal(value = {}) {
  return {
    studentKey: String(value.studentKey || ''),
    name: String(value.name || '').slice(0, 20),
    totalMs: Math.max(0, Number(value.totalMs || 0)),
  }
}

function publicGlobalStudyTotal(value = {}) {
  return {
    ...publicStudyTotal(value),
    classNumber: Number(value.classNumber || 0),
  }
}

async function getStudy(student) {
  const now = Date.now()
  const date = koreaDateKey(now)
  const [activeSnapshot, dailySnapshot, globalSnapshot] = await Promise.all([
    studyActiveCollection(student).get(),
    studyDailyCollection(student).where('date', '==', date).get(),
    studyGlobalDailyCollection(student).where('date', '==', date).get(),
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
    .map(publicStudyTotal)
    .sort((a, b) => b.totalMs - a.totalMs)

  const globalMap = new Map(
    globalSnapshot.docs.map((snapshot) => {
      const value = snapshot.data() || {}
      return [snapshot.id, publicGlobalStudyTotal(value)]
    }),
  )

  const backfill = student.db.batch()
  let backfillCount = 0
  dailySnapshot.docs.forEach((snapshot) => {
    const value = snapshot.data() || {}
    const studentKey = String(value.studentKey || snapshot.id)
    const ref = globalStudyRef(student, date, studentKey)
    const publicValue = publicGlobalStudyTotal({
      studentKey,
      name: value.name,
      totalMs: value.totalMs,
      classNumber: student.classNumber,
    })
    if (!globalMap.has(ref.id)) {
      backfill.set(ref, {
        date,
        classId: student.classId,
        classNumber: student.classNumber,
        ...publicValue,
        updatedAt: Number(value.updatedAt || now),
      }, { merge: true })
      backfillCount += 1
    }
    globalMap.set(ref.id, publicValue)
  })
  if (backfillCount) await backfill.commit()

  const globalTotals = [...globalMap.values()]
    .sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name))
    .slice(0, 120)

  return {
    ok: true,
    resource: 'study',
    date,
    me: student.studentKey,
    active,
    totals,
    globalTotals,
    generatedAt: now,
  }
}

async function startStudy(student, body) {
  const activeRef = studyActiveCollection(student).doc(student.studentKey)
  const now = Date.now()
  const subject = normalizeStudySubject(body.subject)
  const date = koreaDateKey(now)
  const dailyRef = studyDailyCollection(student).doc(`${date}_${student.studentKey}`)
  const globalRef = globalStudyRef(student, date)
  let existingActive = null

  await student.db.runTransaction(async (transaction) => {
    const [activeSnapshot, dailySnapshot] = await Promise.all([
      transaction.get(activeRef),
      transaction.get(dailyRef),
    ])
    if (activeSnapshot.exists && visibleStudySession(activeSnapshot.data(), now)) {
      existingActive = activeSnapshot.data() || {}
      return
    }

    let totalMs = dailySnapshot.exists ? Math.max(0, Number(dailySnapshot.data()?.totalMs || 0)) : 0
    if (activeSnapshot.exists) {
      const stale = activeSnapshot.data() || {}
      totalMs += safeStudyDurationMs(stale.startedAt, now, stale.heartbeatAt)
    }
    if (activeSnapshot.exists || dailySnapshot.exists) {
      const dailyValue = {
        date,
        studentKey: student.studentKey,
        name: student.name,
        totalMs,
        updatedAt: now,
      }
      transaction.set(dailyRef, dailyValue)
      transaction.set(globalRef, {
        ...dailyValue,
        classId: student.classId,
        classNumber: student.classNumber,
      }, { merge: true })
    }
    transaction.set(activeRef, {
      name: student.name,
      subject,
      startedAt: now,
      heartbeatAt: now,
    })
  })

  if (existingActive) {
    return { ok: true, alreadyActive: true, session: { studentKey: student.studentKey, ...existingActive } }
  }
  return {
    ok: true,
    session: { studentKey: student.studentKey, name: student.name, subject, startedAt: now, heartbeatAt: now },
  }
}

async function heartbeatStudy(student) {
  const ref = studyActiveCollection(student).doc(student.studentKey)
  const snapshot = await ref.get()
  if (!snapshot.exists) return { ok: true, active: false }
  const now = Date.now()
  await ref.update({ heartbeatAt: now })
  return { ok: true, active: true, heartbeatAt: now }
}

async function stopStudy(student) {
  const activeRef = studyActiveCollection(student).doc(student.studentKey)
  const now = Date.now()
  const date = koreaDateKey(now)
  const dailyRef = studyDailyCollection(student).doc(`${date}_${student.studentKey}`)
  const globalRef = globalStudyRef(student, date)
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
    const totalMs = Math.max(0, previous) + addedMs
    const dailyValue = {
      date,
      studentKey: student.studentKey,
      name: student.name,
      totalMs,
      updatedAt: now,
    }
    transaction.set(dailyRef, dailyValue)
    transaction.set(globalRef, {
      ...dailyValue,
      classId: student.classId,
      classNumber: student.classNumber,
    }, { merge: true })
    transaction.delete(activeRef)
  })

  return { ok: true, addedMs, date }
}

export function isPreviewV2Resource(value) {
  return value === 'board' || value === 'study'
}

export async function handlePreviewV2(student, { method, resource, body = {} }) {
  if (method === 'GET') {
    if (resource === 'board') return getBoard(student)
    if (resource === 'study') return getStudy(student)
  }

  if (method === 'POST') {
    const action = String(body.action || '').trim()
    if (resource === 'board') {
      if (action === 'create') return createPost(student, body)
      if (action === 'comment') return addComment(student, body)
      if (action === 'resolve') return resolveQuestion(student, body)
    }
    if (resource === 'study') {
      if (action === 'start') return startStudy(student, body)
      if (action === 'heartbeat') return heartbeatStudy(student)
      if (action === 'stop') return stopStudy(student)
    }
  }

  const error = new Error('지원하지 않는 테스트 요청이에요.')
  error.status = 400
  error.code = 'invalid_preview_action'
  throw error
}
