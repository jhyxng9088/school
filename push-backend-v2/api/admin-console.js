import { adminAuth, adminDb } from '../lib/firebase-admin.js'

const ACTIVE_WINDOW_MS = 2 * 60 * 1000
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

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
  return String(value ?? '').trim().slice(0, max)
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function classNumberFromId(classId) {
  const match = /^class-(\d{1,2})$/.exec(String(classId || ''))
  return match ? Number(match[1]) : null
}

function classIdFromRef(ref) {
  const parts = ref.path.split('/')
  const index = parts.indexOf('classes')
  return index >= 0 ? parts[index + 1] || '' : ''
}

async function verifyRequest(req) {
  const token = bearerToken(req)
  if (!token) return { error: { status: 401, body: { ok: false, error: 'missing_auth', message: '로그인이 필요해.' } } }
  try {
    const decoded = await adminAuth().verifyIdToken(token)
    return { decoded }
  } catch {
    return { error: { status: 401, body: { ok: false, error: 'invalid_auth', message: '로그인 정보가 만료됐어.' } } }
  }
}

async function readAdmin(uid) {
  const snapshot = await adminDb().collection('admins').doc(uid).get()
  if (!snapshot.exists || snapshot.data()?.active !== true) return null
  const value = snapshot.data() || {}
  return {
    uid,
    role: value.role === 'super_admin' ? 'super_admin' : 'admin',
    label: safeText(value.label, 60) || 'S-Hub 관리자',
  }
}

async function requireAdmin(decoded, role = 'admin') {
  const admin = await readAdmin(decoded.uid)
  if (!admin) return { error: { status: 403, body: { ok: false, error: 'admin_required', message: '관리자 권한이 필요해.' } } }
  if (role === 'super_admin' && admin.role !== 'super_admin') {
    return { error: { status: 403, body: { ok: false, error: 'super_admin_required', message: '최고 관리자 권한이 필요해.' } } }
  }
  return { admin }
}

async function authUserMap() {
  const map = new Map()
  let pageToken
  do {
    const page = await adminAuth().listUsers(1000, pageToken)
    for (const user of page.users) map.set(user.uid, user)
    pageToken = page.pageToken
  } while (pageToken)
  return map
}

async function buildOverview() {
  const db = adminDb()
  const [usersSnap, presenceSnap, todosSnap, academicSnap, activitySnap, pushSnap, authMap] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('presence').get(),
    db.collectionGroup('todos').get(),
    db.collectionGroup('academicEvents').get(),
    db.collectionGroup('activity').get(),
    db.collectionGroup('pushSubscriptions').get(),
    authUserMap(),
  ])

  const presenceByStudent = new Map()
  for (const item of presenceSnap.docs) {
    const data = item.data() || {}
    const key = safeText(data.studentKey, 100)
    const lastSeen = Number(data.lastSeenMs || 0)
    if (key && lastSeen > (presenceByStudent.get(key) || 0)) presenceByStudent.set(key, lastSeen)
  }

  const pushCountByStudent = new Map()
  for (const item of pushSnap.docs) {
    const data = item.data() || {}
    const key = safeText(data.studentKey, 100)
    if (key) pushCountByStudent.set(key, (pushCountByStudent.get(key) || 0) + 1)
  }

  const remindersByClass = new Map()
  for (const item of todosSnap.docs) {
    const classId = classIdFromRef(item.ref)
    if (classId) remindersByClass.set(classId, (remindersByClass.get(classId) || 0) + 1)
  }

  const academicsByClass = new Map()
  for (const item of academicSnap.docs) {
    const classId = classIdFromRef(item.ref)
    if (classId) academicsByClass.set(classId, (academicsByClass.get(classId) || 0) + 1)
  }

  const grouped = new Map()
  for (const snapshot of usersSnap.docs) {
    const value = snapshot.data() || {}
    const studentKey = safeText(value.studentKey, 100) || `uid:${snapshot.id}`
    const authUser = authMap.get(snapshot.id)
    if (!grouped.has(studentKey)) grouped.set(studentKey, [])
    grouped.get(studentKey).push({ uid: snapshot.id, value, authUser })
  }

  const now = Date.now()
  const users = [...grouped.entries()].map(([studentKey, identities]) => {
    identities.sort((a, b) => Number(a.value.createdAt || 0) - Number(b.value.createdAt || 0))
    const primary = identities[0]
    const value = primary.value
    const classId = safeText(value.classId, 40)
    const presence = presenceByStudent.get(studentKey) || 0
    const createdAt = Math.min(...identities.map((item) => Number(item.value.createdAt || 0)).filter(Boolean), Infinity)
    const allDisabled = identities.every((item) => item.authUser?.disabled === true)
    return {
      uid: primary.uid,
      uids: identities.map((item) => item.uid),
      name: safeText(value.name, 30) || '이름 없음',
      grade: numberOrNull(value.grade),
      classId,
      classNumber: numberOrNull(value.classNumber) ?? classNumberFromId(classId),
      studentNumber: numberOrNull(value.studentNumber),
      studentKey,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      updatedAt: Math.max(...identities.map((item) => Number(item.value.updatedAt || 0)), 0),
      lastSeenAt: Math.max(...identities.map((item) => Number(item.value.lastSeenAt || 0)), 0),
      lastSyncAt: Math.max(...identities.map((item) => Number(item.value.lastSyncAt || 0)), 0),
      appVersion: safeText(value.appVersion, 40),
      platform: safeText(value.platform, 80),
      browser: safeText(value.browser, 80),
      displayMode: safeText(value.displayMode, 30),
      status: allDisabled ? 'disabled' : 'active',
      effectiveLastSeenAt: Math.max(presence, Number(value.lastSeenAt || 0)),
      online: presence >= now - ACTIVE_WINDOW_MS,
      activeToday: Math.max(presence, Number(value.lastSeenAt || 0)) >= now - RECENT_WINDOW_MS,
      pushDevices: pushCountByStudent.get(studentKey) || 0,
      identityCount: identities.length,
    }
  }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99)
    || (a.classNumber ?? 99) - (b.classNumber ?? 99)
    || (a.studentNumber ?? 99) - (b.studentNumber ?? 99)
    || a.name.localeCompare(b.name, 'ko'))

  const classesMap = new Map()
  for (const user of users) {
    const key = user.classId || `class-${user.classNumber ?? 'unknown'}`
    if (!classesMap.has(key)) classesMap.set(key, {
      classId: key,
      grade: user.grade,
      classNumber: user.classNumber,
      students: 0,
      online: 0,
      activeToday: 0,
      disabled: 0,
      reminders: remindersByClass.get(key) || 0,
      academics: academicsByClass.get(key) || 0,
    })
    const row = classesMap.get(key)
    row.students += 1
    if (user.online) row.online += 1
    if (user.activeToday) row.activeToday += 1
    if (user.status !== 'active') row.disabled += 1
  }

  const activity = activitySnap.docs
    .map((item) => ({ id: item.id, classId: classIdFromRef(item.ref), ...(item.data() || {}) }))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 250)

  return {
    users,
    classes: [...classesMap.values()].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99)),
    activity,
    metrics: {
      total: users.length,
      online: users.filter((user) => user.online).length,
      activeToday: users.filter((user) => user.activeToday).length,
      disabled: users.filter((user) => user.status !== 'active').length,
      missingStudentNumber: users.filter((user) => !Number.isInteger(user.studentNumber)).length,
      missingGrade: users.filter((user) => !Number.isInteger(user.grade)).length,
    },
  }
}

async function studentDetails(studentKey) {
  const db = adminDb()
  const [todoSnap, userSnap] = await Promise.all([
    db.collection('students').doc(studentKey).collection('todoState').get(),
    db.collection('users').where('studentKey', '==', studentKey).get(),
  ])
  return {
    todoState: todoSnap.docs.map((item) => ({ id: item.id, completed: item.data()?.completed === true, hidden: item.data()?.hidden === true, updatedAt: Number(item.data()?.updatedAt || 0) })),
    identityCount: userSnap.size,
  }
}

async function setStudentDisabled(studentKey, disabled, actorUid, reason) {
  const db = adminDb()
  const users = await db.collection('users').where('studentKey', '==', studentKey).get()
  if (users.empty) throw new Error('student_not_found')
  await Promise.all(users.docs.map((item) => adminAuth().updateUser(item.id, { disabled })))
  await db.collection('adminAudit').add({
    action: disabled ? 'student_disabled' : 'student_restored',
    actorUid,
    targetStudentKey: studentKey,
    targetUids: users.docs.map((item) => item.id),
    reason: safeText(reason, 240),
    createdAt: Date.now(),
  })
  return { affectedAuthUsers: users.size }
}

async function deleteCollectionInBatches(collectionRef) {
  while (true) {
    const snapshot = await collectionRef.limit(300).get()
    if (snapshot.empty) return
    const batch = adminDb().batch()
    snapshot.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
  }
}

async function deleteStudent(studentKey, actorUid, reason) {
  const db = adminDb()
  const users = await db.collection('users').where('studentKey', '==', studentKey).get()
  if (users.empty) throw new Error('student_not_found')
  const classIds = [...new Set(users.docs.map((item) => safeText(item.data()?.classId, 40)).filter(Boolean))]
  const uids = users.docs.map((item) => item.id)

  await deleteCollectionInBatches(db.collection('students').doc(studentKey).collection('todoState'))
  await Promise.all(classIds.flatMap((classId) => [
    db.collection('classes').doc(classId).collection('members').doc(studentKey).delete().catch(() => {}),
    db.collection('classes').doc(classId).collection('presence').doc(studentKey).delete().catch(() => {}),
  ]))

  for (const classId of classIds) {
    const pushes = await db.collection('classes').doc(classId).collection('pushSubscriptions').where('studentKey', '==', studentKey).get().catch(() => null)
    if (pushes && !pushes.empty) {
      const batch = db.batch()
      pushes.docs.forEach((item) => batch.delete(item.ref))
      await batch.commit()
    }
  }

  const batch = db.batch()
  users.docs.forEach((item) => batch.delete(item.ref))
  await batch.commit()
  await Promise.all(uids.map((uid) => adminAuth().deleteUser(uid).catch((error) => {
    if (error?.code !== 'auth/user-not-found') throw error
  })))

  await db.collection('adminAudit').add({
    action: 'student_deleted',
    actorUid,
    targetStudentKey: studentKey,
    targetUids: uids,
    classIds,
    reason: safeText(reason, 240),
    createdAt: Date.now(),
  })
  return { affectedAuthUsers: uids.length }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const verified = await verifyRequest(req)
  if (verified.error) return res.status(verified.error.status).json(verified.error.body)

  try {
    const action = safeText(req.body?.action, 40)
    if (action === 'identity') {
      const admin = await readAdmin(verified.decoded.uid)
      return res.status(200).json({ ok: true, admin })
    }

    const authorized = await requireAdmin(verified.decoded, action === 'delete_student' ? 'super_admin' : 'admin')
    if (authorized.error) return res.status(authorized.error.status).json(authorized.error.body)

    if (action === 'overview') return res.status(200).json({ ok: true, data: await buildOverview() })
    if (action === 'student_details') {
      const studentKey = safeText(req.body?.studentKey, 100)
      if (!studentKey) return res.status(400).json({ ok: false, error: 'student_key_required', message: '학생 식별자가 없어.' })
      return res.status(200).json({ ok: true, data: await studentDetails(studentKey) })
    }
    if (action === 'set_student_status') {
      const studentKey = safeText(req.body?.studentKey, 100)
      const status = req.body?.status === 'disabled' ? 'disabled' : req.body?.status === 'active' ? 'active' : ''
      if (!studentKey || !status) return res.status(400).json({ ok: false, error: 'invalid_request', message: '학생 또는 상태 값이 올바르지 않아.' })
      const result = await setStudentDisabled(studentKey, status === 'disabled', verified.decoded.uid, req.body?.reason)
      return res.status(200).json({ ok: true, ...result })
    }
    if (action === 'delete_student') {
      const studentKey = safeText(req.body?.studentKey, 100)
      if (!studentKey) return res.status(400).json({ ok: false, error: 'student_key_required', message: '학생 식별자가 없어.' })
      const result = await deleteStudent(studentKey, verified.decoded.uid, req.body?.reason)
      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(400).json({ ok: false, error: 'unknown_action', message: '지원하지 않는 관리자 작업이야.' })
  } catch (error) {
    console.error('admin console failed', { code: error?.code, message: error?.message })
    const message = error?.message === 'student_not_found' ? '학생 정보를 찾지 못했어.' : '관리자 작업을 완료하지 못했어.'
    return res.status(500).json({ ok: false, error: String(error?.code || error?.message || 'admin_console_failed'), message })
  }
}
