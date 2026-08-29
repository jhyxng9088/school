import { getApp } from 'firebase/app'
import { doc, getDocFromServer, getFirestore, setDoc } from 'firebase/firestore'
import { classKeyFor, ensureSignedIn, readStudentProfile } from './school-sync'
import { NEIS_TIMETABLE_SCHOOL, fetchGrade2ClassTimetable, neisTargetWeek } from './neis-timetable'

const SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000
const RETRY_GUARD_MS = 15 * 60 * 1000
const attemptTimes = new Map()

function timetableRef(db, profile) {
  return doc(db, 'classes', classKeyFor(profile), 'settings', 'timetable')
}

function validProfile(profile) {
  const classNumber = Number(profile?.classNumber)
  return profile && Number.isInteger(classNumber) && classNumber >= 1 && classNumber <= 30
}

function recentlyAttempted(classNumber, weekStart) {
  const key = `${classNumber}:${weekStart}`
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
  if (!force && recentlyAttempted(classNumber, week.weekStart)) return { ok: true, reason: 'recent_attempt' }

  await ensureSignedIn()
  const db = getFirestore(getApp('school-sync'))
  const ref = timetableRef(db, profile)
  const snapshot = await getDocFromServer(ref)
  const current = snapshot.exists() ? snapshot.data() || {} : {}

  const alreadyFresh = current.source === 'neis'
    && Number(current.neisGrade) === 2
    && String(current.neisSchoolCode || '') === NEIS_TIMETABLE_SCHOOL.schoolCode
    && String(current.neisWeekStart || '') === week.weekStart
    && Date.now() - Number(current.neisSyncedAt || 0) < SYNC_MAX_AGE_MS

  if (!force && alreadyFresh) return { ok: true, reason: 'fresh' }

  const result = await fetchGrade2ClassTimetable(classNumber, new Date())
  if (!result.available) {
    return { ok: false, reason: 'neis_unavailable', classNumber, weekStart: result.weekStart }
  }

  const firstNeisMigration = current.source !== 'neis'
  const now = Date.now()
  const payload = {
    weeklySchedule: result.weeklySchedule,
    source: 'neis',
    neisGrade: 2,
    neisSchoolCode: NEIS_TIMETABLE_SCHOOL.schoolCode,
    neisWeekStart: result.weekStart,
    neisWeekEnd: result.weekEnd,
    neisSyncedAt: now,
    updatedAt: now,
    ...(firstNeisMigration ? { overrides: {} } : {}),
  }

  await setDoc(ref, payload, { merge: true })
  return {
    ok: true,
    reason: firstNeisMigration ? 'migrated' : 'updated',
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
  window.setTimeout(() => safeSync(), delay)
}

if (typeof window !== 'undefined') {
  scheduleSync(900)
  window.addEventListener('school:student-profile-saved', () => scheduleSync(250))
  window.addEventListener('online', () => scheduleSync(350))
  window.addEventListener('focus', () => scheduleSync(500))
}
