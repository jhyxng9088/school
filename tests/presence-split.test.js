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

test('presence prefers Supabase and keeps RTDB then Firestore as failure-only fallbacks', () => {
  const source = transformedSchoolSync()
  assert.match(source, /import \{ startSupabasePresence \} from '\.\/supabase-presence\.js'/)
  assert.match(source, /supabasePresence = startSupabasePresence\(\{/)
  assert.match(source, /fallbackLevel = 'supabase'/)
  assert.match(source, /const activateRealtimeFallback = \(reason\) =>/)
  assert.match(source, /realtimePresenceConfigured\(\)/)
  assert.match(source, /startRealtimePresence\(\{/)
  assert.match(source, /const activateFirestoreFallback = \(reason\) =>/)
  assert.match(source, /stopActiveTransport = startFirestoreFallback\(\)/)
  assert.match(source, /onUnavailable: activateRealtimeFallback/)
  assert.match(source, /onUnavailable: activateFirestoreFallback/)
})

test('normal Supabase presence heartbeat does not read or write Firestore presence', () => {
  const source = read('../src/supabase-presence.js')
  assert.match(source, /functions\/v1\/class-presence/)
  assert.match(source, /PRESENCE_REFRESH_MS = 45_000/)
  assert.match(source, /body: JSON\.stringify\(\{ action \}\)/)
  assert.match(source, /action, 'heartbeat'/)
  assert.match(source, /action, 'leave'/)
  assert.match(source, /school:class-presence/)
  assert.doesNotMatch(source, /firebase\/firestore/)
  assert.doesNotMatch(source, /setDoc\(/)
  assert.doesNotMatch(source, /getCountFromServer/)
})

test('member total is cached and cannot block the active presence transport', () => {
  const source = transformedSchoolSync()
  assert.match(source, /MEMBER_COUNT_CACHE_MS = 30 \* 60 \* 1000/)
  assert.match(source, /readCachedMemberCount\(\{ allowStale: true \}\)/)
  assert.match(source, /cacheMemberCount\(total\)/)
  assert.match(source, /getCountFromServer\(classMembersCollection\(profile\)\)/)
  assert.match(source, /void ensureMemberBestEffort\(\)/)
  assert.match(source, /Firestore membership bookkeeping is independent from the live presence transport/)
  assert.doesNotMatch(source, /Promise\.all\(\[\s*getCountFromServer\(classMembersCollection/)
})

test('RTDB stays as a secondary fallback without inventing an unverified database URL', () => {
  const source = read('../src/presence-rtdb.js')
  assert.match(source, /VITE_FIREBASE_DATABASE_URL \|\| ''/)
  assert.doesNotMatch(source, /-default-rtdb\.asia-southeast1\.firebasedatabase\.app/)
  assert.match(source, /ref\(database, '\.info\/connected'\)/)
  assert.match(source, /onDisconnect\(ownPresence\)/)
  assert.match(source, /await disconnect\.remove\(\)/)
})

test('Firestore presence remains an idempotent last-resort fallback', () => {
  const source = transformedSchoolSync()
  assert.match(source, /if \(stopped \|\| fallbackLevel === 'firestore'\) return/)
  assert.match(source, /setDoc\(classPresenceRef\(profile\)/)
  assert.match(source, /getCountFromServer\(query\(/)
  assert.match(source, /window\.setInterval\(refreshPresence, 30 \* 1000\)/)
  assert.match(source, /External presence unavailable; using Firestore fallback/)
})

test('firebase config retains the locked RTDB rules file for emergency fallback', () => {
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
