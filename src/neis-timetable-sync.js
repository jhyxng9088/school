import { ensureSignedIn, readStudentProfile } from './school-sync'
import { fetchClassTimetable, neisTargetWeek } from './neis-timetable'
import { schoolScopeKey } from './school-directory.js'

const SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000
const RETRY_GUARD_MS = 15 * 60 * 1000
const CACHE_PREFIX = 'school.neisTimetableSync.v2'
const NEIS_TIMETABLE_SYNC_API_URL = 'https://school-reminder-backend.vercel.app/api/timetable-neis-sync'
const attemptTimes = new Map()
let syncTimer = 0
let syncDueAt = 0

function validProfile(profile) {
  const classNumber = Number(profile?.classNumber)
  const grade = Number(profile?.grade)
  return profile
    && String(profile?.officeCode || '').trim()
    && String(profile?.schoolCode || '').trim()
    && Number.isInteger(grade) && grade >= 1 && grade <= 6
    && Number.isInteger(classNumber) && classNumber >= 1 && classNumber <= 30
}

function cacheKey(profile, weekStart) {
  const scope = schoolScopeKey(profile)
  return `${CACHE_PREFIX}.${scope}.class-${profile.classNumber}.${weekStart}`
}

function readCache(profile, weekStart) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(profile, weekStart)) || 'null')
  } catch {
    return null
  }
}

function writeCache(profile, weekStart, value) {
  try {
    localStorage.setItem(cacheKey(profile, weekStart), JSON.stringify(value))
  } catch {
    // A failed local cache must never block Firestore/NEIS sync.
  }
}

function recentlyAttempted(profile, weekStart) {
  const key = `${schoolScopeKey(profile)}:${profile.classNumber}:${weekStart}`
  const previous = Number(attemptTimes.get(key) || 0)
  if (Date.now() - previous < RETRY_GUARD_MS) return true
  attemptTimes.set(key, Date.now())
  return false
}

async function writeNeisTimetableThroughServer(result, cached) {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw new Error('NEIS timetable sync auth unavailable')

  const response = await fetch(NEIS_TIMETABLE_SYNC_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      weeklySchedule: result.weeklySchedule,
      lastClientSyncAt: Number(cached?.syncedAt || 0),
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    throw new Error(String(body?.error || `NEIS timetable sync failed (${response.status})`))
  }
  return body
}

export async function syncCurrentClassTimetableFromNeis({ force = false } = {}) {
  const profile = readStudentProfile()
  if (!validProfile(profile)) return { ok: false, reason: 'no_profile' }

  const classNumber = Number(profile.classNumber)
  const week = neisTargetWeek(new Date())
  const cached = readCache(profile, week.weekStart)
  const cachedFresh = cached?.ok === true
    && cached.weekStart === week.weekStart
    && Date.now() - Number(cached.syncedAt || 0) < SYNC_MAX_AGE_MS

  if (!force && cachedFresh) return { ok: true, reason: 'fresh' }
  if (!force && recentlyAttempted(profile, week.weekStart)) return { ok: true, reason: 'recent_attempt' }

  const result = await fetchClassTimetable(profile, new Date())
  if (!result.available) {
    writeCache(profile, week.weekStart, {
      ok: false,
      attemptedAt: Date.now(),
      weekStart: result.weekStart,
      reason: 'neis_unavailable',
    })
    return { ok: false, reason: 'neis_unavailable', classNumber, weekStart: result.weekStart }
  }

  await writeNeisTimetableThroughServer(result, cached)
  const now = Date.now()

  writeCache(profile, result.weekStart, {
    ok: true,
    syncedAt: now,
    weekStart: result.weekStart,
    weekEnd: result.weekEnd,
    subjectCount: result.subjectCount,
  })

  return {
    ok: true,
    reason: 'updated',
    classNumber,
    subjectCount: result.subjectCount,
    weekStart: result.weekStart,
    weekEnd: result.weekEnd,
  }
}

async function safeSync(options) {
  try {
    return await syncCurrentClassTimetableFromNeis(options)
  } catch (error) {
    console.warn('NEIS timetable sync skipped:', error)
    return { ok: false, reason: 'error' }
  }
}

function scheduleSync(delay = 700) {
  const dueAt = Date.now() + delay
  if (syncTimer && syncDueAt <= dueAt) return
  if (syncTimer) window.clearTimeout(syncTimer)

  syncDueAt = dueAt
  syncTimer = window.setTimeout(() => {
    syncTimer = 0
    syncDueAt = 0
    void safeSync()
  }, delay)
}

if (typeof window !== 'undefined') {
  scheduleSync(900)
  window.addEventListener('school:student-profile-saved', () => scheduleSync(250))
  window.addEventListener('online', () => scheduleSync(350))
  window.addEventListener('focus', () => scheduleSync(500))
}
