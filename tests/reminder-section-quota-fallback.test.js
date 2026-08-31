import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const client = fs.readFileSync(path.join(root, 'src', 'reminder-section-client.js'), 'utf8')

test('section edits survive Firestore quota exhaustion and retry later', () => {
  assert.match(client, /reminder-section\/quota-exhausted/)
  assert.match(client, /school\.reminderSection\.pending\.\$\{PENDING_SECTION_QUEUE_VERSION\}/)
  assert.match(client, /school\.reminderCategories\.\$\{REMINDER_CATEGORIES_CACHE_VERSION\}\.\$\{classKey\}/)
  assert.match(client, /queuePendingSectionUpdate\(payload, optimistic\)/)
  assert.match(client, /pendingSync:\s*true/)
  assert.match(client, /flushPendingReminderSectionChanges/)
  assert.match(client, /window\.setInterval\(retry, PENDING_SECTION_RETRY_MS\)/)
  assert.match(client, /window\.location\.reload\(\)/)
})

test('only update failures are queued while destructive section actions stay server-authoritative', () => {
  const updateBlock = client.slice(client.indexOf("if (action !== 'update')"))
  assert.match(updateBlock, /queueableUpdateError\(error\)/)
  assert.match(updateBlock, /queuePendingSectionUpdate\(payload, optimistic\)/)

  const deleteBlock = client.slice(client.indexOf("if (action === 'delete')"), client.indexOf("if (action === 'restore')"))
  assert.doesNotMatch(deleteBlock, /queuePendingSectionUpdate/)
})
