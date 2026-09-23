import { getApp } from 'firebase/app'
import { getAuth, signOut } from 'firebase/auth'

const STUDENT_IDENTITY_SYNC_KEY = 'school.studentIdentitySync.v1'
const AUTH_STATE_READY_TIMEOUT_MS = 900

function readIdentityMarker() {
  try {
    return localStorage.getItem(STUDENT_IDENTITY_SYNC_KEY) || ''
  } catch {
    return ''
  }
}

function clearIdentityMarker() {
  try {
    localStorage.removeItem(STUDENT_IDENTITY_SYNC_KEY)
  } catch {
    // A reload still clears the in-memory auth owner even if localStorage is unavailable.
  }
}

export async function recoverStudentAuthForProfile(profileSignature, { force = false } = {}) {
  const signature = String(profileSignature || '').trim()
  const marker = readIdentityMarker()
  if (!signature) return false
  if (!force && (!marker || marker.endsWith(`|${signature}`))) return false

  const auth = getAuth(getApp('school-sync'))
  if (typeof auth.authStateReady === 'function') {
    let timedOut = false
    let timeoutId = null
    try {
      const timeout = new Promise((resolve) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true
          resolve()
        }, AUTH_STATE_READY_TIMEOUT_MS)
      })
      await Promise.race([
        Promise.resolve(auth.authStateReady()).catch(() => {}),
        timeout,
      ])
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }

    if (timedOut) {
      clearIdentityMarker()
      return false
    }
  }

  const user = auth.currentUser
  if (!user) {
    clearIdentityMarker()
    return false
  }
  if (!user.isAnonymous) return false

  await signOut(auth)
  clearIdentityMarker()
  window.location.reload()
  return true
}
