import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('presence prefers Supabase and keeps RTDB then Firestore as failure-only fallbacks', () => {
  const source = read('../src/school-sync.js')
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
  assert.match(source, /requestPresence\(user, classId, 'heartbeat'/)
  assert.match(source, /requestPresence\(user, classId, 'leave'/)
  assert.match(source, /school:class-presence/)
  assert.doesNotMatch(source, /firebase\/firestore/)
  assert.doesNotMatch(source, /setDoc\(/)
  assert.doesNotMatch(source, /getCountFromServer/)
})

test('canonical Supabase presence owner retains one replayable snapshot without another network owner', () => {
  const source = read('../src/supabase-presence.js')
  const roster = read('../src/class-roster-ui-v2.js')

  assert.match(source, /const latestSnapshots = new Map\(\)/)
  assert.match(source, /latestSnapshots\.set\(detail\.classId, detail\)/)
  assert.match(source, /export function readLatestSupabasePresenceSnapshot\(classId\)/)
  assert.match(roster, /import \{ readLatestSupabasePresenceSnapshot \} from '\.\/supabase-presence\.js'/)
  assert.match(roster, /function applyLatestPresenceSnapshot\(\)/)
  assert.match(roster, /readLatestSupabasePresenceSnapshot\(`class-\$\{classNumber\}`\)/)

  const rosterPresenceListeners = roster.match(/addEventListener\('school:class-presence'/g) || []
  assert.equal(rosterPresenceListeners.length, 1)
  assert.doesNotMatch(roster, /functions\/v1\/class-presence/)
  assert.doesNotMatch(roster, /setInterval\(/)
})

test('member total is cached and cannot block the active presence transport', () => {
  const source = read('../src/school-sync.js')
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
  const source = read('../src/school-sync.js')
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

test('presence transport is raw-source-owned without a Vite build patch', () => {
  const source = read('../src/school-sync.js')
  const vite = read('../vite.config.js')
  assert.match(source, /import \{ realtimePresenceConfigured, startRealtimePresence \} from '\.\/presence-rtdb\.js'/)
  assert.match(source, /import \{ startSupabasePresence \} from '\.\/supabase-presence\.js'/)
  assert.doesNotMatch(vite, /patchPresenceSplitSource|presence-split-patch/)
  assert.equal(fs.existsSync(new URL('../src/presence-split-patch.js', import.meta.url)), false)
})

test('app shell E2E cannot reach production network while using the synthetic student profile', () => {
  const source = read('../e2e/app-shell-smoke.spec.js')
  assert.match(source, /async function isolateProductionNetwork\(page\)/)
  assert.match(source, /await page\.route\('\*\*\/\*'/)
  assert.match(source, /requestUrl\.hostname === '127\.0\.0\.1'/)
  assert.match(source, /requestUrl\.hostname === 'localhost'/)
  assert.match(source, /await route\.abort\('blockedbyclient'\)/)
  assert.match(source, /name: 'E2E Student'/)

  const isolatedRuns = source.match(/await isolateProductionNetwork\(page\)/g) || []
  const navigations = source.match(/await page\.goto\('index\.html'\)/g) || []
  assert.equal(isolatedRuns.length, navigations.length)
  assert.ok(isolatedRuns.length >= 4)
})
