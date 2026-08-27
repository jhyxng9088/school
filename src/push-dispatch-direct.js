import { getApp, getApps } from 'firebase/app'
import { deleteDoc, doc, getFirestore, runTransaction } from 'firebase/firestore'
import { ensureSignedIn, readStudentProfile, studentKeyFor, classKeyFor } from './school-sync'

const PUSH_API_BASE = 'https://school-push-backend.vercel.app/api'
const PUSH_ACTIVITY_EVENT = 'school:activity-committed'
const syncApp = getApps().some((app) => app.name === 'school-sync') ? getApp('school-sync') : null
const db = syncApp ? getFirestore(syncApp) : null

async function hashEvent(value) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40)
  }
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

async function dispatchCommittedActivity(event) {
  if (!db) return
  const detail = event?.detail || {}
  const profile = readStudentProfile()
  if (!profile) return

  const classId = classKeyFor(profile)
  const myStudentKey = studentKeyFor(profile)
  if (!classId || !myStudentKey || detail.actorStudentKey !== myStudentKey) return
  if (!detail.entityType || !detail.entityId || !detail.updatedAt) return

  const user = await ensureSignedIn()
  const fingerprint = [
    classId,
    detail.entityType,
    detail.entityId,
    detail.sourceId || `${detail.entityType}:${detail.entityId}`,
    detail.action === 'added' ? 'added' : 'edited',
    detail.updatedAt,
  ].join('|')
  const claimRef = doc(
    db,
    'classes',
    classId,
    'pushDispatchClaims',
    `activity-${await hashEvent(fingerprint)}`,
  )

  const claimed = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(claimRef)
    if (snapshot.exists()) return false
    transaction.set(claimRef, {
      kind: 'activity',
      actorStudentKey: myStudentKey,
      createdAt: Date.now(),
    })
    return true
  })
  if (!claimed) return

  try {
    const idToken = await user.getIdToken()
    const response = await fetch(`${PUSH_API_BASE}/push-dispatch`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        entityType: String(detail.entityType),
        entityId: String(detail.entityId),
        sourceId: String(detail.sourceId || `${detail.entityType}:${detail.entityId}`),
        action: detail.action === 'added' ? 'added' : 'edited',
        updatedAt: Number(detail.updatedAt),
      }),
    })
    if (!response.ok) throw new Error(`Push dispatch failed: ${response.status}`)
  } catch (error) {
    await deleteDoc(claimRef).catch(() => {})
    throw error
  }
}

window.addEventListener(PUSH_ACTIVITY_EVENT, (event) => {
  dispatchCommittedActivity(event).catch((error) => {
    console.error('Immediate class push failed:', error)
  })
})
