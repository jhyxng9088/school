import crypto from 'node:crypto'

function claimId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 48)
}

export async function acquireClaim(db, key, metadata = {}, nowMs = Date.now()) {
  const ref = db.collection('scheduledPushClaims').doc(claimId(key))
  const leaseMs = 12 * 60 * 1000
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const existing = snapshot.exists ? snapshot.data() || {} : null
    if (existing?.status === 'sent') return false
    if (existing?.status === 'sending' && Number(existing.leaseUntil || 0) > nowMs) return false
    transaction.set(ref, {
      key: String(key).slice(0, 500),
      status: 'sending',
      createdAt: existing?.createdAt || nowMs,
      updatedAt: nowMs,
      leaseUntil: nowMs + leaseMs,
      ...metadata,
    }, { merge: true })
    return true
  })
  return { acquired, ref }
}

export async function markClaimSent(ref, summary, nowMs = Date.now()) {
  await ref.set({
    status: 'sent',
    sentAt: nowMs,
    updatedAt: nowMs,
    leaseUntil: 0,
    summary,
  }, { merge: true })
}

export async function releaseClaim(ref) {
  await ref.delete().catch(() => {})
}
