import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const client = fs.readFileSync(path.join(root, 'src', 'reminder-section-client.js'), 'utf8')

test('section edits survive quota exhaustion without navigating away', () => {
  assert.match(client, /reminder-section\/quota-exhausted/)
  assert.match(client, /school\.reminderSection\.pending\.\$\{PENDING_SECTION_QUEUE_VERSION\}/)
  assert.match(client, /school\.reminderCategories\.\$\{REMINDER_CATEGORIES_CACHE_VERSION\}\.\$\{classKey\}/)
  assert.match(client, /queuePendingSectionUpdate\(payload, optimistic\)/)
  assert.match(client, /pendingSync:\s*true/)
  assert.match(client, /flushPendingReminderSectionChanges/)
  assert.match(client, /window\.setInterval\(retry, PENDING_SECTION_RETRY_MS\)/)
  assert.doesNotMatch(client, /window\.location\.reload/)
})

test('only quota failures are queued and destructive section actions remain server-authoritative', () => {
  const queueableBlock = client.slice(
    client.indexOf('function queueableUpdateError'),
    client.indexOf('async function postSectionChange'),
  )
  assert.match(queueableBlock, /RESOURCE_EXHAUSTED/)
  assert.match(queueableBlock, /reminder-section\/quota-exhausted/)
  assert.doesNotMatch(queueableBlock, /reminder-section\/network/)
  assert.doesNotMatch(client, /REMINDER_SECTION_FALLBACK_API_URL/)

  const updateBlock = client.slice(client.indexOf("if (action !== 'update')"))
  assert.match(updateBlock, /queueableUpdateError\(error\)/)
  assert.match(updateBlock, /queuePendingSectionUpdate\(payload, optimistic\)/)

  const deleteBlock = client.slice(client.indexOf("if (action === 'delete')"), client.indexOf("if (action === 'restore')"))
  assert.doesNotMatch(deleteBlock, /queuePendingSectionUpdate/)
})
