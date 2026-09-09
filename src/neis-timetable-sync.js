import { getApp } from 'firebase/app'
import { doc, getFirestore, setDoc } from 'firebase/firestore'
import { classKeyFor, ensureSignedIn, readStudentProfile } from './school-sync'
import { fetchClassTimetable, neisTargetWeek } from './neis-timetable'
import { schoolScopeKey } from './school-directory.js'

const SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000
const RETRY_GUARD_MS = 15 * 60 * 1000
const CACHE_PREFIX = 'school.neisTimetableSync.v2'
const attemptTimes = new Map()
let syncTimer = 0
let syncDueAt = 0

function timetableRef(db, profile) {
  return doc(db, 'classes', classKeyFor(profile), 'settings', 'timetable')
}

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

  await ensureSignedIn()
  const db = getFirestore(getApp('school-sync'))
  const now = Date.now()

  // Only the shared weekly base is replaced. Date-specific shared overrides and
  // personal moving-class data remain independent and are not touched.
  await setDoc(timetableRef(db, profile), {
    weeklySchedule: result.weeklySchedule,
    updatedAt: now,
  }, { merge: true })

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
