
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('original reminder attachments reuse an in-memory fetch promise', () => {
  const sync = read('src/school-sync.js')
  assert.match(sync, /originalAttachmentMemoryCache = new Map\(\)/)
  assert.match(sync, /const cached = originalAttachmentMemoryCache\.get\(cacheKey\)/)
  assert.match(sync, /if \(cached\) return cached/)
  assert.match(sync, /originalAttachmentMemoryCache\.set\(cacheKey, request\)/)
})

test('summary sheet warms and decodes the first original before the user taps it', () => {
  const summary = read('src/reminder-summary.jsx')
  assert.match(summary, /preparedOriginalsRef = useRef\(new Map\(\)\)/)
  assert.match(summary, /void prepareOriginal\(originalEntries\[0\]\)/)
  assert.match(summary, /blob: base64ToBlob\(original\.dataBase64, original\.mimeType\)/)
  assert.match(summary, /const original = await prepareOriginal\(entry\)/)
})
