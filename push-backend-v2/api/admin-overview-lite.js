import { adminAuth, adminDb } from '../lib/firebase-admin.js'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const ACTIVE_WINDOW_MS = 2 * MINUTE_MS
const WEEK_WINDOW_MS = 7 * DAY_MS
const MONTH_WINDOW_MS = 30 * DAY_MS
const CACHE_TTL_MS = 2 * MINUTE_MS
const ACTIVITY_LIMIT = 300

let overviewCache = null
let overviewCacheAt = 0
let overviewPromise = null

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
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
  const parts = String(ref?.path || '').split('/')
  const index = parts.indexOf('classes')
  return index >= 0 ? parts[index + 1] || '' : ''
}

function normalizeDevice(value) {
  const type = safeText(value.deviceType, 30)
  const label = safeText(value.deviceLabel, 60)
  const platform = safeText(value.platform, 80)
  const browser = safeText(value.browser, 50)
  const displayMode = safeText(value.displayMode, 30)
  return {
    deviceType: type || 'unknown',
    deviceLabel: label || type || platform || '미수집',
    platform,
    browser,
    displayMode,
  }
}

async function verifyAdmin(req) {
  const token = bearerToken(req)
  if (!token) throw Object.assign(new Error('로그인이 필요해.'), { status: 401 })
  const decoded = await adminAuth().verifyIdToken(token)
  const adminSnap = await adminDb().collection('admins').doc(decoded.uid).get()
  if (!adminSnap.exists || adminSnap.data()?.active !== true) {
    throw Object.assign(new Error('관리자 권한이 필요해.'), { status: 403 })
  }
  return decoded
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

async function readActivity(db) {
  try {
    return await db.collectionGroup('activity').orderBy('updatedAt', 'desc').limit(ACTIVITY_LIMIT).get()
  } catch {
    return { docs: [], size: 0 }
  }
}

async function readSettings(db) {
  try {
    return await db.collectionGroup('settings').get()
  } catch {
    return { docs: [] }
  }
}

async function readAudit(db) {
  try {
    return await db.collection('adminAudit').orderBy('createdAt', 'desc').limit(40).get()
  } catch {
    return { docs: [] }
  }
}

async function buildOverview() {
  const db = adminDb()
  const [usersSnap, presenceSnap, todosSnap, academicSnap, pushSnap, activitySnap, settingsSnap, auditSnap, authMap] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('presence').get(),
    db.collectionGroup('todos').get(),
    db.collectionGroup('academicEvents').get(),
    db.collectionGroup('pushSubscriptions').get(),
    readActivity(db),
    readSettings(db),
    readAudit(db),
    authUserMap(),
  ])

  const now = Date.now()
  const presenceByStudent = new Map()
  for (const item of presenceSnap.docs || []) {
    const data = item.data() || {}
    const key = safeText(data.studentKey, 100)
    const lastSeen = Number(data.lastSeenMs || 0)
    if (key && lastSeen > (presenceByStudent.get(key) || 0)) presenceByStudent.set(key, lastSeen)
  }

  const pushCountByStudent = new Map()
  for (const item of pushSnap.docs || []) {
    const key = safeText(item.data()?.studentKey, 100)
    if (key) pushCountByStudent.set(key, (pushCountByStudent.get(key) || 0) + 1)
  }

  const remindersByClass = new Map()
  for (const item of todosSnap.docs || []) {
    const classId = classIdFromRef(item.ref)
    if (classId) remindersByClass.set(classId, (remindersByClass.get(classId) || 0) + 1)
  }

  const academicsByClass = new Map()
  for (const item of academicSnap.docs || []) {
    const classId = classIdFromRef(item.ref)
    if (classId) academicsByClass.set(classId, (academicsByClass.get(classId) || 0) + 1)
  }

  const timetableByClass = new Map()
  for (const item of settingsSnap.docs || []) {
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

  const activity = (activitySnap.docs || []).map((item) => ({
    id: item.id,
    classId: classIdFromRef(item.ref),
    ...(item.data() || {}),
  }))
  const activityByStudent = new Map()
  const activityByClass = new Map()
  for (const item of activity) {
    const updatedAt = Number(item.updatedAt || 0)
    const classId = safeText(item.classId, 40)
    const studentKey = safeText(item.actorStudentKey, 100)
    if (classId) {
      const row = activityByClass.get(classId) || { week: 0, month: 0, lastAt: 0 }
      if (updatedAt >= now - WEEK_WINDOW_MS) row.week += 1
      if (updatedAt >= now - MONTH_WINDOW_MS) row.month += 1
      row.lastAt = Math.max(row.lastAt, updatedAt)
      activityByClass.set(classId, row)
    }
    if (studentKey) {
      const row = activityByStudent.get(studentKey) || { week: 0, month: 0, total: 0, lastAt: 0 }
      row.total += 1
      if (updatedAt >= now - WEEK_WINDOW_MS) row.week += 1
      if (updatedAt >= now - MONTH_WINDOW_MS) row.month += 1
      row.lastAt = Math.max(row.lastAt, updatedAt)
      activityByStudent.set(studentKey, row)
    }
  }

  const grouped = new Map()
  for (const snapshot of usersSnap.docs || []) {
    const value = snapshot.data() || {}
    const studentKey = safeText(value.studentKey, 100) || `uid:${snapshot.id}`
    if (!grouped.has(studentKey)) grouped.set(studentKey, [])
    grouped.get(studentKey).push({ uid: snapshot.id, value, authUser: authMap.get(snapshot.id) })
  }

  const users = [...grouped.entries()].map(([studentKey, identities]) => {
    identities.sort((a, b) => Number(a.value.createdAt || 0) - Number(b.value.createdAt || 0))
    const primary = identities[0]
    const value = primary.value
    const classId = safeText(value.classId, 40)
    const presence = presenceByStudent.get(studentKey) || 0
    const lastSeenAt = Math.max(
      presence,
      ...identities.map((item) => Number(item.value.lastSeenAt || 0)),
      ...identities.map((item) => Date.parse(item.authUser?.metadata?.lastSignInTime || '') || 0),
      0,
    )
    const activityStats = activityByStudent.get(studentKey) || { week: 0, month: 0, total: 0, lastAt: 0 }
    const deviceSource = identities
      .map((item) => item.value)
      .sort((a, b) => Number(b.deviceUpdatedAt || b.updatedAt || 0) - Number(a.deviceUpdatedAt || a.updatedAt || 0))[0] || value
    const device = normalizeDevice(deviceSource)
    const allDisabled = identities.every((item) => item.authUser?.disabled === true)
    const created = identities.map((item) => Number(item.value.createdAt || 0)).filter(Boolean)
    return {
      uid: primary.uid,
      uids: identities.map((item) => item.uid),
      name: safeText(value.name, 30) || '이름 없음',
      grade: numberOrNull(value.grade) ?? 2,
      classId,
      classNumber: numberOrNull(value.classNumber) ?? classNumberFromId(classId),
      studentNumber: numberOrNull(value.studentNumber),
      studentKey,
      createdAt: created.length ? Math.min(...created) : 0,
      updatedAt: Math.max(...identities.map((item) => Number(item.value.updatedAt || 0)), 0),
      effectiveLastSeenAt: lastSeenAt,
      lastSeenAt,
      status: allDisabled ? 'disabled' : 'active',
      online: presence >= now - ACTIVE_WINDOW_MS,
      activeToday: lastSeenAt >= now - DAY_MS,
      active7d: lastSeenAt >= now - WEEK_WINDOW_MS,
      active30d: lastSeenAt >= now - MONTH_WINDOW_MS,
      inactive30d: lastSeenAt > 0 && lastSeenAt < now - MONTH_WINDOW_MS,
      pushDevices: pushCountByStudent.get(studentKey) || 0,
      identityCount: identities.length,
      activityTotal: activityStats.total,
      activity7d: activityStats.week,
      activity30d: activityStats.month,
      lastActivityAt: activityStats.lastAt,
      appVersion: safeText(value.appVersion, 40),
      ...device,
    }
  }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99)
    || (a.classNumber ?? 99) - (b.classNumber ?? 99)
    || (a.studentNumber ?? 99) - (b.studentNumber ?? 99)
    || a.name.localeCompare(b.name, 'ko'))

  const classesMap = new Map()
  for (const user of users) {
    const key = user.classId || `class-${user.classNumber ?? 'unknown'}`
    if (!classesMap.has(key)) {
      const timetable = timetableByClass.get(key) || { configured: false, updatedAt: 0, overrideCount: 0 }
      const classActivity = activityByClass.get(key) || { week: 0, month: 0, lastAt: 0 }
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

  const audit = (auditSnap.docs || []).map((item) => ({ id: item.id, ...(item.data() || {}) }))
  const identityTotal = users.reduce((sum, user) => sum + user.identityCount, 0)
  return {
    users,
    classes: [...classesMap.values()].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99)),
    activity,
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
      totalReminders: todosSnap.size || 0,
      totalAcademicEvents: academicSnap.size || 0,
      totalActivity: activity.length,
      activity7d: activity.filter((item) => Number(item.updatedAt || 0) >= now - WEEK_WINDOW_MS).length,
      classCount: classesMap.size,
      overviewCacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      activityScanLimit: ACTIVITY_LIMIT,
    },
  }
}

async function cachedOverview(force = false) {
  if (!force && overviewCache && Date.now() - overviewCacheAt < CACHE_TTL_MS) return overviewCache
  if (!overviewPromise) {
    overviewPromise = buildOverview().then((value) => {
      overviewCache = value
      overviewCacheAt = Date.now()
      return value
    }).finally(() => { overviewPromise = null })
  }
  return overviewPromise
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: '지원하지 않는 요청이야.' })
  try {
    await verifyAdmin(req)
    const force = req.body?.force === true
    const data = await cachedOverview(force)
    return res.status(200).json({ ok: true, data, cachedAt: overviewCacheAt })
  } catch (error) {
    console.error('admin overview lite failed', { code: error?.code, message: error?.message })
    const status = Number(error?.status || 500)
    return res.status(status).json({ ok: false, error: safeText(error?.code, 80) || 'overview_failed', message: safeText(error?.message, 160) || '관리자 데이터를 불러오지 못했어.' })
  }
}
