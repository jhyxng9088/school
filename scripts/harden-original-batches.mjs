import fs from 'node:fs'

const path = 'src/school-sync.js'
let source = fs.readFileSync(path, 'utf8')

const before = `  const batch = writeBatch(db)\n  batch.set(originalAttachmentRef(profile, safeId), {\n    name: String(file.name || '원본 파일').slice(0, 120),\n    mimeType,\n    size,\n    chunkCount: chunks.length,\n    createdAt: Date.now(),\n  })\n  chunks.forEach((data, index) => {\n    batch.set(originalAttachmentChunkRef(profile, safeId, index), { data })\n  })\n  await batch.commit()`

const after = `  // Keep each Firestore commit comfortably below the 10 MiB request limit.\n  // Metadata is written last so readers never see a partially uploaded original.\n  const chunksPerBatch = 8\n  for (let start = 0; start < chunks.length; start += chunksPerBatch) {\n    const batch = writeBatch(db)\n    chunks.slice(start, start + chunksPerBatch).forEach((data, offset) => {\n      batch.set(originalAttachmentChunkRef(profile, safeId, start + offset), { data })\n    })\n    await batch.commit()\n  }\n\n  await setDoc(originalAttachmentRef(profile, safeId), {\n    name: String(file.name || '원본 파일').slice(0, 120),\n    mimeType,\n    size,\n    chunkCount: chunks.length,\n    createdAt: Date.now(),\n  })`

const count = source.split(before).length - 1
if (count !== 1) throw new Error(`original batch block: expected 1 match, got ${count}`)
source = source.replace(before, after)
fs.writeFileSync(path, source)
console.log('original attachment batches hardened')
