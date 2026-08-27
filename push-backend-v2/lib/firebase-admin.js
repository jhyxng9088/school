
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function parseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (parsed?.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n')
  if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) {
    throw new Error('Firebase service account is incomplete')
  }
  return parsed
}

function adminApp() {
  if (!getApps().length) {
    const serviceAccount = parseServiceAccount()
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
  }
  return getApps()[0]
}

export function adminDb() {
  return getFirestore(adminApp())
}

export function adminAuth() {
  return getAuth(adminApp())
}
