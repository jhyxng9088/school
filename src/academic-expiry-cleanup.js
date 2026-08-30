import { getApp, getApps } from 'firebase/app'
import { collection, deleteDoc, getDocsFromServer, getFirestore } from 'firebase/firestore'
import { classKeyFor, ensureSignedIn, readStudentProfile } from './school-sync'

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CLEANUP_MIN_INTERVAL_MS = 30 * 60 * 1000
const CLEANUP_STAMP_PREFIX = 'school.academicExpiryCleanup.v2.'
let cleanupPromise = null
let midnightTimer = null

function koreaDateKey(nowMs = Date.now()) {
  const shifted = new Date(nowMs + KOREA_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function millisecondsUntilNextKoreaMidnight(nowMs = Date.now()) {
  const shifted = new Date(nowMs + KOREA_OFFSET_MS)
  const nextShiftedMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  )
  return Math.max(1000, nextShiftedMidnight - (nowMs + KOREA_OFFSET_MS) + 1500)
}

function cleanupStampKey(classId) {
  return `${CLEANUP_STAMP_PREFIX}${classId}`
}

function recentlyChecked(classId, nowMs) {
  try {
    const previous = Number(localStorage.getItem(cleanupStampKey(classId)) || 0)
    return previous > 0 && nowMs - previous < CLEANUP_MIN_INTERVAL_MS
  } catch {
    return false
  }
}

function markChecked(classId, nowMs) {
  try {
    localStorage.setItem(cleanupStampKey(classId), String(nowMs))
  } catch {
    // Cleanup correctness does not depend on local storage.
  }
}

export async function cleanupExpiredCustomAcademicEvents(nowMs = Date.now(), { force = false } = {}) {
  if (cleanupPromise) return cleanupPromise
  const profile = readStudentProfile()
  const classId = classKeyFor(profile)
  if (!profile || !classId || navigator.onLine === false) return false
  if (!force && recentlyChecked(classId, nowMs)) return true

  cleanupPromise = (async () => {
    await ensureSignedIn()
    const syncApp = getApps().some((app) => app.name === 'school-sync')
      ? getApp('school-sync')
      : null
    if (!syncApp) return false

    const db = getFirestore(syncApp)
    const snapshot = await getDocsFromServer(collection(db, 'classes', classId, 'academicEvents'))
    const today = koreaDateKey(nowMs)
    const expired = snapshot.docs.filter((item) => {
      const endDate = String(item.data()?.endDate || '')
      return DATE_KEY_PATTERN.test(endDate) && endDate < today
    })
    if (!expired.length) {
      markChecked(classId, nowMs)
      return true
    }

    const results = await Promise.allSettled(expired.map((item) => deleteDoc(item.ref)))
    const rejected = results.filter((result) => result.status === 'rejected')
    if (rejected.length) {
      console.warn(`Expired academic cleanup could not delete ${rejected.length} item(s). Firebase rules may not be updated yet.`)
      return false
    }
    markChecked(classId, nowMs)
    return true
  })().catch((error) => {
    console.warn('Expired academic cleanup skipped:', error)
    return false
  }).finally(() => {
    cleanupPromise = null
  })

  return cleanupPromise
}

function scheduleNextMidnight() {
  if (midnightTimer) window.clearTimeout(midnightTimer)
  midnightTimer = window.setTimeout(() => {
    void cleanupExpiredCustomAcademicEvents(Date.now(), { force: true }).finally(scheduleNextMidnight)
  }, millisecondsUntilNextKoreaMidnight())
}

function refreshCleanup() {
  if (!document.hidden) void cleanupExpiredCustomAcademicEvents()
}

document.addEventListener('visibilitychange', refreshCleanup)
window.addEventListener('focus', refreshCleanup)
window.addEventListener('online', refreshCleanup)
window.addEventListener('school:student-profile-saved', () => {
  if (!document.hidden) void cleanupExpiredCustomAcademicEvents(Date.now(), { force: true })
})
scheduleNextMidnight()
void cleanupExpiredCustomAcademicEvents()
