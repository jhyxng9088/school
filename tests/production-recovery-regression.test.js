import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchProductionRecoverySource } from '../src/production-recovery-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

function recover(relativePath, source = read(relativePath)) {
  return patchProductionRecoverySource(source, path.join(root, relativePath))
}

test('production presence keeps RTDB opt-in until its client path is explicitly configured', () => {
  const source = recover('src/presence-rtdb.js')
  assert.match(source, /VITE_FIREBASE_DATABASE_URL \|\| ''/)
  assert.doesNotMatch(source, /VITE_FIREBASE_DATABASE_URL \|\| DEFAULT_DATABASE_URL/)
})

test('home presence indicator stays visible when online count is known but member total is temporarily unavailable', () => {
  const source = recover('src/main.jsx')
  assert.match(source, /presence\.online > 0 \|\| presence\.total > 0/)
  assert.match(source, /presence\.total > 0 \? `\$\{presence\.online\}\/\$\{presence\.total\}` : presence\.online > 0 \? `\$\{presence\.online\}명`/)
})

test('section edits use only the production backend and never reload the PWA on save failure', () => {
  const source = recover('src/reminder-section-client.js')
  assert.doesNotMatch(source, /REMINDER_SECTION_FALLBACK_API_URL/)
  assert.doesNotMatch(source, /window\.location\.reload/)
  assert.match(source, /code === 'reminder-section\/quota-exhausted'/)

  const queueable = source.slice(
    source.indexOf('function queueableUpdateError'),
    source.indexOf('async function postSectionChange'),
  )
  assert.doesNotMatch(queueable, /reminder-section\/network/)
  assert.doesNotMatch(queueable, /preview-backend-pending/)
})

test('section editor keeps the current sheet open when a quota-limited edit is queued locally', () => {
  const id = path.join(root, 'src/todo-stage5-ai.jsx')
  const previewSource = patchPreviewSHubV2Source(read('src/todo-stage5-ai.jsx'), id)
  const source = patchProductionRecoverySource(previewSource, id)
  assert.match(source, /const result = await saveReminderSectionChange/)
  assert.match(source, /if \(result\?\.pendingSync\)/)
  assert.match(source, /서버 사용량 제한으로 이 기기에 임시 저장했어요/)
})
