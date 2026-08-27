
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAppCheck } from 'firebase-admin/app-check'
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

export async function adminAccessToken() {
  const credential = adminApp().options.credential
  if (!credential?.getAccessToken) throw new Error('Firebase Admin credential cannot issue an access token')
  const result = await credential.getAccessToken()
  const token = String(result?.access_token || '').trim()
  if (!token) throw new Error('Firebase Admin access token is empty')
  return token
}

export async function adminAppCheckToken(appId) {
  const safeAppId = String(appId || '').trim()
  if (!safeAppId) throw new Error('Firebase App ID is missing')
  const result = await getAppCheck(adminApp()).createToken(safeAppId, { ttlMillis: 60 * 60 * 1000 })
  const token = String(result?.token || '').trim()
  if (!token) throw new Error('Firebase Admin App Check token is empty')
  return token
}

export function adminProjectId() {
  const projectId = String(adminApp().options.projectId || '').trim()
  if (!projectId) throw new Error('Firebase Admin project ID is missing')
  return projectId
}
