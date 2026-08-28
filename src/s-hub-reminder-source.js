const SOURCE_TTL_MS = 10 * 60 * 1000

let currentBatch = null
let claimSequence = 0

function originalFiles(files) {
  return Array.from(files || [])
    .filter((file) => file instanceof Blob)
    .slice(0, 4)
}

function freshBatch() {
  if (!currentBatch) return null
  if (Date.now() - currentBatch.createdAt <= SOURCE_TTL_MS) return currentBatch
  currentBatch = null
  return null
}

export function clearSchoolAIReminderSources() {
  currentBatch = null
}

export function rememberSchoolAIReminderSources(items, files, text = '') {
  clearSchoolAIReminderSources()
  const sourceFiles = originalFiles(files)
  const reminderCount = Array.isArray(items)
    ? items.filter((item) => item?.kind === 'reminder' && item?.valid !== false).length
    : 0

  if (!sourceFiles.length || !reminderCount) return

  currentBatch = {
    createdAt: Date.now(),
    text: String(text || '').trim().slice(0, 500),
    files: sourceFiles,
    reminderCount,
    completed: 0,
    activeClaims: new Set(),
  }
}

export function claimSchoolAIReminderSource() {
  const batch = freshBatch()
  if (!batch) return null
  if (batch.completed + batch.activeClaims.size >= batch.reminderCount) return null

  claimSequence += 1
  const claimId = `${batch.createdAt}-${claimSequence}`
  batch.activeClaims.add(claimId)
  return {
    claimId,
    text: batch.text,
    files: batch.files.slice(),
  }
}

export function completeSchoolAIReminderSource(claimId) {
  const batch = freshBatch()
  if (!batch || !batch.activeClaims.has(claimId)) return
  batch.activeClaims.delete(claimId)
  batch.completed += 1
  if (batch.completed >= batch.reminderCount) currentBatch = null
}

export function releaseSchoolAIReminderSource(claimId) {
  const batch = freshBatch()
  if (!batch || !batch.activeClaims.has(claimId)) return
  batch.activeClaims.delete(claimId)
}
