import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleReminderOriginal, safeReminderOriginalId } from '../lib/reminder-original-service.js'

test('reminder original service assembles Firestore base64 chunks into exact binary bytes', () => {
  const source = Buffer.from('S-Hub original image bytes')
  const encoded = source.toString('base64')
  const result = assembleReminderOriginal({
    name: 'photo.png', mimeType: 'image/png', size: source.length, chunkCount: 2,
  }, [encoded.slice(0, 12), encoded.slice(12)])
  assert.equal(result.name, 'photo.png')
  assert.equal(result.mimeType, 'image/png')
  assert.deepEqual(result.buffer, source)
})

test('reminder original service rejects incomplete chunks and sanitizes ids', () => {
  assert.equal(safeReminderOriginalId('abc--a0'), 'abc--a0')
  assert.throws(() => assembleReminderOriginal({ size: 4, chunkCount: 2 }, ['AAAA']), /incomplete/i)
})
