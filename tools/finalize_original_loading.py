from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    target.write_text(text.replace(old, new, 1))


replace_once(
    'src/school-sync.js',
    "  getDocFromServer,\n  getDocsFromServer,",
    "  getDocFromServer,\n  getDocs,\n  getDocsFromServer,",
)

replace_once(
    'src/school-sync.js',
    """    const snapshots = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => getDoc(originalAttachmentChunkRef(profile, safeId, index))),
    )
    if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error('원본 파일 일부를 불러오지 못했어.')
    return {
      name: String(metadata.name || '원본 사진').slice(0, 120),
      mimeType: String(metadata.mimeType || 'application/octet-stream'),
      size: Number(metadata.size || 0),
      dataBase64: snapshots.map((snapshot) => String(snapshot.data()?.data || '')).join(''),
    }
""",
    """    const chunkSnapshot = await getDocs(collection(originalAttachmentRef(profile, safeId), 'chunks'))
    const chunkDocs = [...chunkSnapshot.docs].sort((a, b) => a.id.localeCompare(b.id))
    if (chunkDocs.length !== chunkCount) throw new Error('원본 파일 일부를 불러오지 못했어.')
    return {
      name: String(metadata.name || '원본 사진').slice(0, 120),
      mimeType: String(metadata.mimeType || 'application/octet-stream'),
      size: Number(metadata.size || 0),
      dataBase64: chunkDocs.map((snapshot) => String(snapshot.data()?.data || '')).join(''),
    }
""",
)

summary = Path('src/reminder-summary.jsx')
text = summary.read_text()
old = """  const originalEntries = attachmentManifest(todo)
  const canShowOriginal = Boolean(originalEntries.length && loadOriginal)
"""
new = """  const originalEntries = attachmentManifest(todo)
  const firstOriginalKey = String(originalEntries[0]?.key || '')
  const canShowOriginal = Boolean(originalEntries.length && loadOriginal)
"""
if text.count(old) != 1:
    raise SystemExit('reminder-summary.jsx: manifest marker mismatch')
text = text.replace(old, new, 1)
old_dep = """  }, [todo?.id])

  if (!todo?.summary) return null
"""
new_dep = """  }, [todo?.id, firstOriginalKey, canShowOriginal])

  if (!todo?.summary) return null
"""
if text.count(old_dep) != 1:
    raise SystemExit(f'reminder-summary.jsx: prefetch dependency marker mismatch {text.count(old_dep)}')
text = text.replace(old_dep, new_dep, 1)
summary.write_text(text)

# Extend the existing regression test to guard the one-query chunk loader.
test = Path('tests/reminder-original-prefetch.test.js')
test_text = test.read_text()
needle = """  assert.match(sync, /originalAttachmentMemoryCache\\.set\\(cacheKey, request\\)/)
})
"""
replacement = """  assert.match(sync, /originalAttachmentMemoryCache\\.set\\(cacheKey, request\\)/)
  assert.match(sync, /getDocs\\(collection\\(originalAttachmentRef\\(profile, safeId\\), 'chunks'\\)\\)/)
  assert.doesNotMatch(sync, /Array\\.from\\(\\{ length: chunkCount \\}.*getDoc\\(originalAttachmentChunkRef/s)
})
"""
if test_text.count(needle) != 1:
    raise SystemExit('reminder-original-prefetch.test.js: marker mismatch')
test.write_text(test_text.replace(needle, replacement, 1))
