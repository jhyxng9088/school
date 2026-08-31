import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchDataSplitV1Source } from '../src/data-split-v1-patch.js'
import { patchPresenceSplitSource } from '../src/presence-split-patch.js'

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8')
}

function transformedSchoolSync() {
  const path = new URL('../src/school-sync.js', import.meta.url).pathname
  const raw = read('../src/school-sync.js')
  return patchPresenceSplitSource(patchDataSplitV1Source(raw, path), path)
}

test('presence prefers Realtime Database but preserves a Firestore fallback', () => {
  const source = transformedSchoolSync()
  assert.match(source, /realtimePresenceConfigured\(\)/)
  assert.match(source, /startRealtimePresence\(\{/)
  assert.match(source, /app: syncApp/)
  assert.match(source, /startFirestoreFallback/)
  assert.match(source, /setDoc\(classPresenceRef\(profile\)/)
  assert.match(source, /getCountFromServer\(query\(/)
  assert.match(source, /30 \* 1000/)
})

test('member total is cached instead of being counted every presence heartbeat', () => {
  const source = transformedSchoolSync()
  assert.match(source, /MEMBER_COUNT_CACHE_MS = 30 \* 60 \* 1000/)
  assert.match(source, /readCachedMemberCount/)
  assert.match(source, /cacheMemberCount\(total\)/)
  assert.match(source, /getCountFromServer\(classMembersCollection\(profile\)\)/)
  assert.doesNotMatch(source, /Promise\.all\(\[\s*getCountFromServer\(classMembersCollection/)
})

test('RTDB presence uses connection state and onDisconnect cleanup', () => {
  const source = read('../src/presence-rtdb.js')
  assert.match(source, /VITE_FIREBASE_DATABASE_URL/)
  assert.match(source, /ref\(database, '\.info\/connected'\)/)
  assert.match(source, /onDisconnect\(ownPresence\)/)
  assert.match(source, /await disconnect\.remove\(\)/)
  assert.match(source, /remove\(ownPresence\)/)
  assert.match(source, /onValue\(classPresence/)
})

test('RTDB is opt-in so missing configuration cannot remove the existing presence feature', () => {
  const source = read('../src/presence-rtdb.js')
  assert.match(source, /if \(!realtimePresenceConfigured\(\) \|\| !app\) return null/)
  const school = transformedSchoolSync()
  assert.match(school, /if \(realtimePresence\) \{/)
  assert.match(school, /stopFallback = startFirestoreFallback\(\)/)
})

test('Vite applies read deduplication before the presence transport patch', () => {
  const vite = read('../vite.config.js')
  const dataSplitIndex = vite.indexOf('next = patchDataSplitV1Source(next, cleanId)')
  const presenceIndex = vite.indexOf('next = patchPresenceSplitSource(next, cleanId)')
  assert.ok(dataSplitIndex >= 0)
  assert.ok(presenceIndex > dataSplitIndex)
})
