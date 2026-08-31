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

test('presence prefers Realtime Database but preserves an idempotent Firestore fallback', () => {
  const source = transformedSchoolSync()
  assert.match(source, /realtimePresenceConfigured\(\)/)
  assert.match(source, /startRealtimePresence\(\{/)
  assert.match(source, /app: syncApp/)
  assert.match(source, /const activateFallback = \(reason\) =>/)
  assert.match(source, /if \(stopped \|\| fallbackActive\) return/)
  assert.match(source, /stopActiveTransport = startFirestoreFallback\(\)/)
  assert.match(source, /onUnavailable: activateFallback/)
  assert.match(source, /setDoc\(classPresenceRef\(profile\)/)
  assert.match(source, /getCountFromServer\(query\(/)
  assert.match(source, /30 \* 1000/)
})

test('member total is cached and cannot block independent RTDB online presence', () => {
  const source = transformedSchoolSync()
  assert.match(source, /MEMBER_COUNT_CACHE_MS = 30 \* 60 \* 1000/)
  assert.match(source, /readCachedMemberCount\(\{ allowStale: true \}\)/)
  assert.match(source, /cacheMemberCount\(total\)/)
  assert.match(source, /getCountFromServer\(classMembersCollection\(profile\)\)/)
  assert.match(source, /void ensureMemberBestEffort\(\)/)
  assert.match(source, /A Firestore quota outage must not prevent the independent presence transport/)
  assert.doesNotMatch(source, /Promise\.all\(\[\s*getCountFromServer\(classMembersCollection/)
})

test('RTDB presence uses the production database URL with an environment override', () => {
  const source = read('../src/presence-rtdb.js')
  assert.match(source, /https:\/\/school-adeda-default-rtdb\.asia-southeast1\.firebasedatabase\.app\//)
  assert.match(source, /VITE_FIREBASE_DATABASE_URL \|\| DEFAULT_DATABASE_URL/)
})

test('RTDB presence uses connection state, onDisconnect cleanup, and reports runtime permission failures', () => {
  const source = read('../src/presence-rtdb.js')
  assert.match(source, /ref\(database, '\.info\/connected'\)/)
  assert.match(source, /onDisconnect\(ownPresence\)/)
  assert.match(source, /await disconnect\.remove\(\)/)
  assert.match(source, /remove\(ownPresence\)/)
  assert.match(source, /onValue\(classPresence/)
  assert.match(source, /function reportUnavailable\(error\)/)
  assert.match(source, /onUnavailable\(error\)/)
  assert.match(source, /onValue\(classPresence,[\s\S]*reportUnavailable\)/)
})

test('RTDB stores no student identity payload beyond the Firebase uid path', () => {
  const source = read('../src/presence-rtdb.js')
  assert.doesNotMatch(source, /studentKey/)
  assert.match(source, /await set\(ownPresence, \{\s*connectedAt: serverTimestamp\(\)/)
})

test('RTDB remains safe when unavailable because Firestore fallback is preserved', () => {
  const source = read('../src/presence-rtdb.js')
  assert.match(source, /if \(!realtimePresenceConfigured\(\) \|\| !app\) return null/)
  const school = transformedSchoolSync()
  assert.match(school, /if \(!realtimePresence\) \{\s*activateFallback\(\)/)
  assert.match(school, /stopActiveTransport = startFirestoreFallback\(\)/)
  assert.match(school, /onUnavailable: activateFallback/)
})

test('firebase config registers the locked RTDB rules file for deployment', () => {
  const config = JSON.parse(read('../firebase.json'))
  assert.equal(config.database?.rules, 'database.rules.json')
})

test('Vite applies read deduplication before the presence transport patch', () => {
  const vite = read('../vite.config.js')
  const dataSplitIndex = vite.indexOf('next = patchDataSplitV1Source(next, cleanId)')
  const presenceIndex = vite.indexOf('next = patchPresenceSplitSource(next, cleanId)')
  assert.ok(dataSplitIndex >= 0)
  assert.ok(presenceIndex > dataSplitIndex)
})
