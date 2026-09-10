import { getApp } from 'firebase/app'
import { getAuth, signOut } from 'firebase/auth'

const STUDENT_IDENTITY_SYNC_KEY = 'school.studentIdentitySync.v1'

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
    try {
      await auth.authStateReady()
    } catch {
      // Continue with the currently visible auth state.
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
