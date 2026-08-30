import { adminAuth, adminDb } from '../lib/firebase-admin.js'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const ACTIVE_WINDOW_MS = 2 * MINUTE_MS
const WEEK_WINDOW_MS = 7 * DAY_MS
const MONTH_WINDOW_MS = 30 * DAY_MS
const CACHE_TTL_MS = 2 * MINUTE_MS
const ACTIVITY_LIMIT = 200

let cached = null
let cachedAt = 0
let pending = null

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

function safe(value, max = 120) {
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

function browserLabel(value) {
  const browser = safe(value, 30).toLowerCase()
  if (browser === 'safari') return 'Safari'
  if (browser === 'samsung') return 'Samsung Internet'
  if (browser === 'chrome') return 'Chrome'
  if (browser === 'firefox') return 'Firefox'
  if (browser === 'edge') return 'Edge'
  return browser ? '기타 브라우저' : ''
}

function inferFromUserAgent(raw) {
  const ua = safe(raw, 350)
  if (!ua) return null
  const iPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))
  const iPhone = /iPhone|iPod/i.test(ua)
  const android = /Android/i.test(ua)
  let browser = 'other'
  if (/SamsungBrowser/i.test(ua)) browser = 'samsung'
  else if (/EdgiOS|Edg\//i.test(ua)) browser = 'edge'
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'firefox'
  else if (/CriOS|Chrome/i.test(ua)) browser = 'chrome'
  else if (/Safari/i.test(ua)) browser = 'safari'
  if (iPad) return { deviceType: 'ipad', deviceLabel: 'iPad', browser, displayMode: 'browser', platform: '' }
  if (iPhone) return { deviceType: 'iphone', deviceLabel: 'iPhone', browser, displayMode: 'browser', platform: '' }
  if (android) return { deviceType: 'android', deviceLabel: /SM-|Samsung/i.test(ua) ? 'Android · Samsung' : 'Android', browser, displayMode: 'browser', platform: '' }
  return { deviceType: 'desktop', deviceLabel: 'PC / Mac', browser, displayMode: 'browser', platform: '' }
}

async function verifyAdmin(req) {
  const token = bearerToken(req)
  if (!token) throw Object.assign(new Error('로그인이 필요해.'), { status: 401 })
  const decoded = await adminAuth().verifyIdToken(token)
  const snap = await adminDb().collection('admins').doc(decoded.uid).get()
  if (!snap.exists || snap.data()?.active !== true) throw Object.assign(new Error('관리자 권한이 필요해.'), { status: 403 })
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

async function optional(getter, fallback) {
  try { return await getter() } catch (error) {
    console.warn('admin overview optional query skipped', { code: error?.code, message: error?.message })
    return fallback
  }
}

async function countCollection(ref) {
  try {
    const result = await ref.count().get()
    return Number(result.data()?.count || 0)
  } catch {
    return 0
  }
}

async function buildOverview() {
  const db = adminDb()
  const now = Date.now()

  // Only users are a required full read. Everything else is recent, small, aggregate, or optional.
  const [usersSnap, presenceSnap, devicesSnap, pushSnap, activitySnap, auditSnap, authMap] = await Promise.all([
    db.collection('users').get(),
    optional(() => db.collectionGroup('presence').where('lastSeenMs', '>=', now - MONTH_WINDOW_MS).get(), { docs: [] }),
    optional(() => db.collection('adminDevices').get(), { docs: [] }),
    optional(() => db.collectionGroup('pushSubscriptions').get(), { docs: [] }),
    optional(() => db.collectionGroup('activity').where('updatedAt', '>=', now - MONTH_WINDOW_MS).limit(ACTIVITY_LIMIT).get(), { docs: [] }),
    optional(() => db.collection('adminAudit').orderBy('createdAt', 'desc').limit(40).get(), { docs: [] }),
    authUserMap(),
  ])

  const presenceByStudent = new Map()
  for (const item of presenceSnap.docs || []) {
    const data = item.data() || {}
    const key = safe(data.studentKey, 100)
    const lastSeen = Number(data.lastSeenMs || 0)
    if (key && lastSeen > (presenceByStudent.get(key) || 0)) presenceByStudent.set(key, lastSeen)
  }

  const deviceByUid = new Map()
  for (const item of devicesSnap.docs || []) deviceByUid.set(item.id, item.data() || {})

  const pushCountByStudent = new Map()
  const pushDeviceByStudent = new Map()
  for (const item of pushSnap.docs || []) {
    const data = item.data() || {}
    const key = safe(data.studentKey, 100)
    if (!key) continue
    pushCountByStudent.set(key, (pushCountByStudent.get(key) || 0) + 1)
    const inferred = inferFromUserAgent(data.userAgent)
    if (inferred && !pushDeviceByStudent.has(key)) pushDeviceByStudent.set(key, inferred)
  }

  const activity = (activitySnap.docs || []).map((item) => ({ id: item.id, classId: classIdFromRef(item.ref), ...(item.data() || {}) }))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  const activityByStudent = new Map()
  const activityByClass = new Map()
  for (const item of activity) {
    const updatedAt = Number(item.updatedAt || 0)
    const classId = safe(item.classId, 40)
    const studentKey = safe(item.actorStudentKey, 100)
    if (classId) {
      const row = activityByClass.get(classId) || { week: 0, month: 0, lastAt: 0 }
      if (updatedAt >= now - WEEK_WINDOW_MS) row.week += 1
      row.month += 1
      row.lastAt = Math.max(row.lastAt, updatedAt)
      activityByClass.set(classId, row)
    }
    if (studentKey) {
      const row = activityByStudent.get(studentKey) || { week: 0, month: 0, total: 0, lastAt: 0, lastAction: '', lastEntityType: '' }
      row.total += 1
      if (updatedAt >= now - WEEK_WINDOW_MS) row.week += 1
      row.month += 1
      if (updatedAt >= row.lastAt) {
        row.lastAt = updatedAt
        row.lastAction = safe(item.action, 30)
        row.lastEntityType = safe(item.entityType, 30)
      }
      activityByStudent.set(studentKey, row)
    }
  }

  const grouped = new Map()
  for (const snapshot of usersSnap.docs || []) {
    const value = snapshot.data() || {}
    const studentKey = safe(value.studentKey, 100) || `uid:${snapshot.id}`
    if (!grouped.has(studentKey)) grouped.set(studentKey, [])
    grouped.get(studentKey).push({ uid: snapshot.id, value, authUser: authMap.get(snapshot.id) })
  }

  const users = [...grouped.entries()].map(([studentKey, identities]) => {
    identities.sort((a, b) => Number(a.value.createdAt || 0) - Number(b.value.createdAt || 0))
    const primary = identities[0]
    const value = primary.value
    const classId = safe(value.classId, 40)
    const presence = presenceByStudent.get(studentKey) || 0
    const authLastSeen = Math.max(...identities.map((item) => Date.parse(item.authUser?.metadata?.lastSignInTime || '') || 0), 0)
    const lastSeenAt = Math.max(presence, authLastSeen, Number(value.lastSeenAt || 0))
    const allDisabled = identities.every((item) => item.authUser?.disabled === true)
    const created = identities.map((item) => Number(item.value.createdAt || 0)).filter(Boolean)
    const stats = activityByStudent.get(studentKey) || { week: 0, month: 0, total: 0, lastAt: 0, lastAction: '', lastEntityType: '' }
    const registeredDevice = identities
      .map((item) => ({ uid: item.uid, ...(deviceByUid.get(item.uid) || {}) }))
      .filter((item) => item.deviceType)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]
    const device = registeredDevice || pushDeviceByStudent.get(studentKey) || { deviceType: 'unknown', deviceLabel: '미수집', browser: '', displayMode: '', platform: '' }
    return {
      uid: primary.uid,
      uids: identities.map((item) => item.uid),
      name: safe(value.name, 30) || '이름 없음',
      grade: numberOrNull(value.grade) ?? 2,
      classId,
      classNumber: numberOrNull(value.classNumber) ?? classNumberFromId(classId),
      studentNumber: numberOrNull(value.studentNumber),
      studentKey,
      createdAt: created.length ? Math.min(...created) : 0,
      updatedAt: Math.max(...identities.map((item) => Number(item.value.updatedAt || 0)), 0),
      lastSeenAt,
      effectiveLastSeenAt: lastSeenAt,
      status: allDisabled ? 'disabled' : 'active',
      online: presence >= now - ACTIVE_WINDOW_MS,
      activeToday: lastSeenAt >= now - DAY_MS,
      active7d: lastSeenAt >= now - WEEK_WINDOW_MS,
      active30d: lastSeenAt >= now - MONTH_WINDOW_MS,
      inactive30d: lastSeenAt > 0 && lastSeenAt < now - MONTH_WINDOW_MS,
      pushDevices: pushCountByStudent.get(studentKey) || 0,
      identityCount: identities.length,
      activityTotal: stats.total,
      activity7d: stats.week,
      activity30d: stats.month,
      lastActivityAt: stats.lastAt,
      lastActivityAction: stats.lastAction,
      lastActivityEntityType: stats.lastEntityType,
      appVersion: safe(value.appVersion, 40),
      deviceType: safe(device.deviceType, 30) || 'unknown',
      deviceLabel: safe(device.deviceLabel, 60) || '미수집',
      platform: safe(device.platform, 80),
      browser: safe(device.browser, 30),
      browserLabel: browserLabel(device.browser),
      displayMode: safe(device.displayMode, 30),
    }
  }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99) || (a.studentNumber ?? 99) - (b.studentNumber ?? 99) || a.name.localeCompare(b.name, 'ko'))

  const classIds = [...new Set(users.map((user) => user.classId).filter((value) => /^class-\d{1,2}$/.test(value)))]
  const classMeta = new Map()
  await Promise.all(classIds.map(async (classId) => {
    const [reminders, academics, timetableSnap] = await Promise.all([
      countCollection(db.collection('classes').doc(classId).collection('todos')),
      countCollection(db.collection('classes').doc(classId).collection('academicEvents')),
      optional(() => db.collection('classes').doc(classId).collection('settings').doc('timetable').get(), null),
    ])
    const timetable = timetableSnap?.exists ? timetableSnap.data() || {} : {}
    classMeta.set(classId, {
      reminders,
      academics,
      timetableConfigured: Boolean(timetable.weeklySchedule && Object.keys(timetable.weeklySchedule).length),
      timetableUpdatedAt: Number(timetable.updatedAt || 0),
      timetableOverrideCount: timetable.overrides && typeof timetable.overrides === 'object' ? Object.keys(timetable.overrides).length : 0,
    })
  }))

  const classesMap = new Map()
  for (const user of users) {
    const key = user.classId || `class-${user.classNumber ?? 'unknown'}`
    if (!classesMap.has(key)) {
      const meta = classMeta.get(key) || { reminders: 0, academics: 0, timetableConfigured: false, timetableUpdatedAt: 0, timetableOverrideCount: 0 }
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
        reminders: meta.reminders,
        academics: meta.academics,
        activity7d: classActivity.week,
        activity30d: classActivity.month,
        lastActivityAt: classActivity.lastAt,
        timetableConfigured: meta.timetableConfigured,
        timetableUpdatedAt: meta.timetableUpdatedAt,
        timetableOverrideCount: meta.timetableOverrideCount,
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

  const classes = [...classesMap.values()].sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.classNumber ?? 99) - (b.classNumber ?? 99))
  const audit = (auditSnap.docs || []).map((item) => ({ id: item.id, ...(item.data() || {}) }))
  const identityTotal = users.reduce((sum, user) => sum + user.identityCount, 0)
  return {
    users,
    classes,
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
      missingStudentNumber: users.filter((user) => !Number.isInteger(user.studentNumber)).length,
      missingGrade: users.filter((user) => !Number.isInteger(user.grade)).length,
      missingLastSeen: users.filter((user) => !user.effectiveLastSeenAt).length,
      stalePresence: 0,
      totalReminders: classes.reduce((sum, row) => sum + row.reminders, 0),
      totalAcademicEvents: classes.reduce((sum, row) => sum + row.academics, 0),
      totalActivity: activity.length,
      activity7d: activity.filter((item) => Number(item.updatedAt || 0) >= now - WEEK_WINDOW_MS).length,
      classCount: classes.length,
      deviceCollected: users.filter((user) => user.deviceType !== 'unknown').length,
      overviewCacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    },
  }
}

async function getOverview() {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached
  if (!pending) {
    pending = buildOverview().then((value) => {
      cached = value
      cachedAt = Date.now()
      return value
    }).finally(() => { pending = null })
  }
  return pending
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: '지원하지 않는 요청이야.' })
  try {
    await verifyAdmin(req)
    const data = await getOverview()
    return res.status(200).json({ ok: true, data, cachedAt })
  } catch (error) {
    console.error('admin overview v2 failed', { code: error?.code, message: error?.message })
    const status = Number(error?.status || 500)
    return res.status(status).json({ ok: false, error: safe(error?.code, 80) || 'overview_failed', message: safe(error?.message, 160) || '관리자 데이터를 불러오지 못했어.' })
  }
}
