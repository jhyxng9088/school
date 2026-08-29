import { adminAuth, adminDb } from '../lib/firebase-admin.js'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const ACTIVE_WINDOW_MS = 2 * MINUTE_MS
const TODAY_WINDOW_MS = DAY_MS
const WEEK_WINDOW_MS = 7 * DAY_MS
const MONTH_WINDOW_MS = 30 * DAY_MS

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

function dateMs(value) {
  if (!value) return 0
  const number = Number(value)
  if (Number.isFinite(number) && number > 0) return number
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
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

function actionLabel(action) {
  if (action === 'added') return '추가'
  if (action === 'edited') return '수정'
  return safeText(action, 30) || '활동'
}

async function buildOverview() {
  const db = adminDb()
  const [usersSnap, presenceSnap, todosSnap, academicSnap, activitySnap, pushSnap, settingsSnap, auditSnap, authMap] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('presence').get(),
    db.collectionGroup('todos').get(),
    db.collectionGroup('academicEvents').get(),
    db.collectionGroup('activity').get(),
    db.collectionGroup('pushSubscriptions').get(),
    db.collectionGroup('settings').get().catch(() => ({ docs: [] })),
    db.collection('adminAudit').orderBy('createdAt', 'desc').limit(80).get().catch(() => ({ docs: [] })),
    authUserMap(),
  ])

  const now = Date.now()
  const presenceByStudent = new Map()
  const stalePresence = []
  for (const item of presenceSnap.docs) {
    const data = item.data() || {}
    const key = safeText(data.studentKey, 100)
    const lastSeen = Number(data.lastSeenMs || 0)
    if (key && lastSeen > (presenceByStudent.get(key) || 0)) presenceByStudent.set(key, lastSeen)
    if (key && lastSeen > 0 && lastSeen < now - MONTH_WINDOW_MS) stalePresence.push({ key, lastSeen })
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

  const timetableByClass = new Map()
  for (const item of settingsSnap.docs) {
    if (item.id !== 'timetable') continue
    const classId = classIdFromRef(item.ref)
    if (!classId) continue
    const data = item.data() || {}
    timetableByClass.set(classId, {
      configured: Boolean(data.weeklySchedule && Object.keys(data.weeklySchedule).length),
      updatedAt: Number(data.updatedAt || 0),
      overrideCount: data.overrides && typeof data.overrides === 'object' ? Object.keys(data.overrides).length : 0,
    })
  }

  const activityByClass = new Map()
  const activityByStudent = new Map()
  const activity = activitySnap.docs
    .map((item) => ({ id: item.id, classId: classIdFromRef(item.ref), ...(item.data() || {}) }))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))

  for (const item of activity) {
    const updatedAt = Number(item.updatedAt || 0)
    const classId = safeText(item.classId, 40)
    const studentKey = safeText(item.actorStudentKey, 100)
    if (classId) {
      const stats = activityByClass.get(classId) || { total: 0, today: 0, week: 0, month: 0, lastAt: 0 }
      stats.total += 1
      if (updatedAt >= now - TODAY_WINDOW_MS) stats.today += 1
      if (updatedAt >= now - WEEK_WINDOW_MS) stats.week += 1
      if (updatedAt >= now - MONTH_WINDOW_MS) stats.month += 1
      stats.lastAt = Math.max(stats.lastAt, updatedAt)
      activityByClass.set(classId, stats)
    }
    if (studentKey) {
      const stats = activityByStudent.get(studentKey) || { total: 0, week: 0, month: 0, lastAt: 0, lastAction: '', lastEntityType: '' }
      stats.total += 1
      if (updatedAt >= now - WEEK_WINDOW_MS) stats.week += 1
      if (updatedAt >= now - MONTH_WINDOW_MS) stats.month += 1
      if (updatedAt >= stats.lastAt) {
        stats.lastAt = updatedAt
        stats.lastAction = actionLabel(item.action)
        stats.lastEntityType = safeText(item.entityType, 30)
      }
      activityByStudent.set(studentKey, stats)
    }
  }

  const grouped = new Map()
  for (const snapshot of usersSnap.docs) {
    const value = snapshot.data() || {}
    const studentKey = safeText(value.studentKey, 100) || `uid:${snapshot.id}`
    const authUser = authMap.get(snapshot.id)
    if (!grouped.has(studentKey)) grouped.set(studentKey, [])
    grouped.get(studentKey).push({ uid: snapshot.id, value, authUser })
  }

  const users = [...grouped.entries()].map(([studentKey, identities]) => {
    identities.sort((a, b) => Number(a.value.createdAt || 0) - Number(b.value.createdAt || 0))
    const primary = identities[0]
    const value = primary.value
    const classId = safeText(value.classId, 40)
    const presence = presenceByStudent.get(studentKey) || 0
    const createdValues = identities.map((item) => Number(item.value.createdAt || 0)).filter(Boolean)
    const createdAt = createdValues.length ? Math.min(...createdValues) : 0
    const lastSeenAt = Math.max(presence, ...identities.map((item) => Number(item.value.lastSeenAt || 0)), ...identities.map((item) => dateMs(item.authUser?.metadata?.lastSignInTime)), 0)
    const allDisabled = identities.every((item) => item.authUser?.disabled === true)
    const studentActivity = activityByStudent.get(studentKey) || { total: 0, week: 0, month: 0, lastAt: 0, lastAction: '', lastEntityType: '' }
    return {
      uid: primary.uid,
      uids: identities.map((item) => item.uid),
      name: safeText(value.name, 30) || '이름 없음',
      grade: numberOrNull(value.grade),
      classId,
      classNumber: numberOrNull(value.classNumber) ?? classNumberFromId(classId),
      studentNumber: numberOrNull(value.studentNumber),
      studentKey,
      createdAt,
      updatedAt: Math.max(...identities.map((item) => Number(item.value.updatedAt || 0)), 0),
      lastSeenAt,
      lastSyncAt: Math.max(...identities.map((item) => Number(item.value.lastSyncAt || 0)), 0),
      appVersion: safeText(value.appVersion, 40),
      platform: safeText(value.platform, 80),
      browser: safeText(value.browser, 80),
      displayMode: safeText(value.displayMode, 30),
      status: allDisabled ? 'disabled' : 'active',
      effectiveLastSeenAt: lastSeenAt,
      online: presence >= now - ACTIVE_WINDOW_MS,
      activeToday: lastSeenAt >= now - TODAY_WINDOW_MS,
      active7d: lastSeenAt >= now - WEEK_WINDOW_MS,
      active30d: lastSeenAt >= now - MONTH_WINDOW_MS,
      inactive30d: lastSeenAt > 0 && lastSeenAt < now - MONTH_WINDOW_MS,
      pushDevices: pushCountByStudent.get(studentKey) || 0,
      identityCount: identities.length,
      activityTotal: studentActivity.total,
      activity7d: studentActivity.week,
      activity30d: studentActivity.month,
      lastActivityAt: studentActivity.lastAt,
      lastActivityAction: studentActivity.lastAction,
      lastActivityEntityType: studentActivity.lastEntityType,
    }
  }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99) || (a.studentNumber ?? 99) - (b.studentNumber ?? 99) || a.name.localeCompare(b.name, 'ko'))

  const classesMap = new Map()
  for (const user of users) {
    const key = user.classId || `class-${user.classNumber ?? 'unknown'}`
    if (!classesMap.has(key)) {
      const timetable = timetableByClass.get(key) || { configured: false, updatedAt: 0, overrideCount: 0 }
      const classActivity = activityByClass.get(key) || { total: 0, today: 0, week: 0, month: 0, lastAt: 0 }
      classesMap.set(key, {
        classId: key,
        grade: user.grade,
        classNumber: user.classNumber,
        students: 0,
        online: 0,
        activeToday: 0,
        active7d: 0,
        active30d: 0,
        inactive30d: 0,
        disabled: 0,
        reminders: remindersByClass.get(key) || 0,
        academics: academicsByClass.get(key) || 0,
        activityTotal: classActivity.total,
        activityToday: classActivity.today,
        activity7d: classActivity.week,
        activity30d: classActivity.month,
        lastActivityAt: classActivity.lastAt,
        timetableConfigured: timetable.configured,
        timetableUpdatedAt: timetable.updatedAt,
        timetableOverrideCount: timetable.overrideCount,
      })
    }
    const row = classesMap.get(key)
    row.students += 1
    if (user.online) row.online += 1
    if (user.activeToday) row.activeToday += 1
    if (user.active7d) row.active7d += 1
    if (user.active30d) row.active30d += 1
    if (user.inactive30d) row.inactive30d += 1
    if (user.status !== 'active') row.disabled += 1
  }

  const audit = auditSnap.docs.map((item) => {
    const value = item.data() || {}
    return {
      id: item.id,
      action: safeText(value.action, 50),
      actorUid: safeText(value.actorUid, 100),
      targetStudentKey: safeText(value.targetStudentKey, 100),
      targetName: safeText(value.targetName, 40),
      createdAt: Number(value.createdAt || 0),
      affectedAuthUsers: Number(value.affectedAuthUsers || value.targetUids?.length || 0),
    }
  })

  const identityTotal = users.reduce((sum, user) => sum + user.identityCount, 0)
  return {
    users,
    classes: [...classesMap.values()].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99)),
    activity: activity.slice(0, 250),
    audit,
    metrics: {
      total: users.length,
      authIdentities: identityTotal,
      extraIdentities: Math.max(0, identityTotal - users.length),
      multiIdentityStudents: users.filter((user) => user.identityCount > 1).length,
      online: users.filter((user) => user.online).length,
      activeToday: users.filter((user) => user.activeToday).length,
      active7d: users.filter((user) => user.active7d).length,
      active30d: users.filter((user) => user.active30d).length,
      inactive30d: users.filter((user) => user.inactive30d).length,
      joined7d: users.filter((user) => user.createdAt >= now - WEEK_WINDOW_MS).length,
      disabled: users.filter((user) => user.status !== 'active').length,
      pushEnabled: users.filter((user) => user.pushDevices > 0).length,
      missingStudentNumber: users.filter((user) => !Number.isInteger(user.studentNumber)).length,
      missingGrade: users.filter((user) => !Number.isInteger(user.grade)).length,
      missingLastSeen: users.filter((user) => !user.effectiveLastSeenAt).length,
      stalePresence: stalePresence.length,
      totalReminders: todosSnap.size,
      totalAcademicEvents: academicSnap.size,
      totalActivity: activity.length,
      activity7d: activity.filter((item) => Number(item.updatedAt || 0) >= now - WEEK_WINDOW_MS).length,
      classCount: classesMap.size,
    },
  }
}

async function studentDetails(studentKey) {
  const db = adminDb()
  const [todoSnap, userSnap, activitySnap, pushSnap] = await Promise.all([
    db.collection('students').doc(studentKey).collection('todoState').get(),
    db.collection('users').where('studentKey', '==', studentKey).get(),
    db.collectionGroup('activity').where('actorStudentKey', '==', studentKey).get().catch(() => ({ docs: [] })),
    db.collectionGroup('pushSubscriptions').where('studentKey', '==', studentKey).get().catch(() => ({ docs: [] })),
  ])

  const identities = await Promise.all(userSnap.docs.map(async (item) => {
    try {
      const authUser = await adminAuth().getUser(item.id)
      return { uid: item.id, disabled: authUser.disabled === true, createdAt: dateMs(authUser.metadata?.creationTime), lastSignInAt: dateMs(authUser.metadata?.lastSignInTime) }
    } catch (error) {
      if (error?.code === 'auth/user-not-found') return { uid: item.id, disabled: null, createdAt: 0, lastSignInAt: 0 }
      throw error
    }
  }))

  const todoState = todoSnap.docs.map((item) => ({ id: item.id, completed: item.data()?.completed === true, hidden: item.data()?.hidden === true, updatedAt: Number(item.data()?.updatedAt || 0) })).sort((a, b) => b.updatedAt - a.updatedAt)
  const recentActivity = activitySnap.docs.map((item) => ({
    id: item.id,
    classId: classIdFromRef(item.ref),
    entityType: safeText(item.data()?.entityType, 30),
    entityId: safeText(item.data()?.entityId, 120),
    action: actionLabel(item.data()?.action),
    updatedAt: Number(item.data()?.updatedAt || 0),
  })).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)

  return {
    todoState,
    todoSummary: {
      total: todoState.length,
      completed: todoState.filter((item) => item.completed).length,
      hidden: todoState.filter((item) => item.hidden).length,
      lastChangedAt: todoState[0]?.updatedAt || 0,
    },
    identityCount: userSnap.size,
    identities: identities.sort((a, b) => b.lastSignInAt - a.lastSignInAt),
    pushDevices: pushSnap.docs.length,
    recentActivity,
    activityTotal: activitySnap.docs.length,
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
    targetName: safeText(users.docs[0]?.data()?.name, 40),
    targetUids: users.docs.map((item) => item.id),
    affectedAuthUsers: users.size,
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
  const targetName = safeText(users.docs[0]?.data()?.name, 40)

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
    targetName,
    targetUids: uids,
    affectedAuthUsers: uids.length,
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
    const message = error?.message === 'student_not_found' ? '학생을 찾지 못했어.' : '관리자 작업을 완료하지 못했어.'
    return res.status(500).json({ ok: false, error: safeText(error?.code || error?.message, 120) || 'admin_console_failed', message })
  }
}
