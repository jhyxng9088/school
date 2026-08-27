const ORIGINAL_MAX_BYTES = 8_000_000
const ORIGINAL_MAX_CHUNKS = 24

export function safeReminderOriginalId(value) {
  const id = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 130)
  if (!id) throw Object.assign(new Error('Invalid original attachment id'), { status: 400, code: 'invalid_original_id' })
  return id
}

function safeClassId(value) {
  const classId = String(value || '').trim()
  if (!/^class-\d{1,2}$/.test(classId)) {
    throw Object.assign(new Error('Invalid class identity'), { status: 403, code: 'invalid_class_identity' })
  }
  return classId
}

export function assembleReminderOriginal(metadata, chunks) {
  const source = metadata && typeof metadata === 'object' ? metadata : {}
  const size = Number(source.size || 0)
  const chunkCount = Number(source.chunkCount || 0)
  if (!Number.isInteger(size) || size < 1 || size > ORIGINAL_MAX_BYTES) {
    throw Object.assign(new Error('Original attachment size is invalid'), { status: 502, code: 'invalid_original_metadata' })
  }
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > ORIGINAL_MAX_CHUNKS || chunks.length !== chunkCount) {
    throw Object.assign(new Error('Original attachment chunks are incomplete'), { status: 502, code: 'original_chunks_incomplete' })
  }
  const encoded = chunks.map((value) => String(value || '')).join('')
  if (!encoded) throw Object.assign(new Error('Original attachment is empty'), { status: 502, code: 'original_empty' })
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length !== size) {
    throw Object.assign(new Error('Original attachment size does not match metadata'), { status: 502, code: 'original_size_mismatch' })
  }
  return {
    name: String(source.name || '원본 사진').slice(0, 120),
    mimeType: String(source.mimeType || 'application/octet-stream').slice(0, 120),
    size,
    buffer,
  }
}

export async function loadReminderOriginal(db, classIdValue, originalIdValue) {
  const classId = safeClassId(classIdValue)
  const originalId = safeReminderOriginalId(originalIdValue)
  const originalRef = db.collection('classes').doc(classId).collection('originalAttachments').doc(originalId)
  const metadataSnapshot = await originalRef.get()
  if (!metadataSnapshot.exists) {
    throw Object.assign(new Error('Original attachment was not found'), { status: 404, code: 'original_not_found' })
  }
  const metadata = metadataSnapshot.data() || {}
  const chunkCount = Number(metadata.chunkCount || 0)
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > ORIGINAL_MAX_CHUNKS) {
    throw Object.assign(new Error('Original attachment metadata is invalid'), { status: 502, code: 'invalid_original_metadata' })
  }

  const refs = Array.from({ length: chunkCount }, (_, index) => (
    originalRef.collection('chunks').doc(String(index).padStart(3, '0'))
  ))
  const snapshots = await db.getAll(...refs)
  const chunks = snapshots.map((snapshot, index) => {
    if (!snapshot?.exists || snapshot.id !== String(index).padStart(3, '0')) {
      throw Object.assign(new Error('Original attachment chunks are incomplete'), { status: 502, code: 'original_chunks_incomplete' })
    }
    return String(snapshot.data()?.data || '')
  })
  return assembleReminderOriginal(metadata, chunks)
}
