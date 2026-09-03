import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/class-roster-v2.js', import.meta.url), 'utf8')

test('quota-safe roster endpoint derives class identity only from the bearer token', () => {
  assert.match(source, /verifyIdToken\(token\)/)
  assert.match(source, /collection\('users'\)\.doc\(decoded\.uid\)\.get\(\)/)
  assert.match(source, /const classId = String\(identityData\.classId/)
  assert.doesNotMatch(source, /req\.query\?\.class/)
  assert.match(source, /if \(req\.method !== 'GET'\)/)
})

test('normal roster reads use Supabase presence and do not scan history', () => {
  const initialReads = source.match(/const \[membersSnapshot, supabaseCache, supabasePresence\] = await Promise\.all\(\[[\s\S]*?\n    \]\)/)?.[0] || ''
  assert.match(initialReads, /classRef\.collection\('members'\)\.get\(\)/)
  assert.match(initialReads, /loadSupabaseRosterIdentities\(\{ token, classId \}\)/)
  assert.match(initialReads, /loadSupabaseClassPresence\(\{ token, classId \}\)/)
  assert.doesNotMatch(initialReads, /collection\('presence'\)\.get\(\)/)
  assert.doesNotMatch(initialReads, /activity/)
  assert.doesNotMatch(initialReads, /academicEvents/)

  assert.match(source, /if \(!presence\) \{[\s\S]*classRef\.collection\('presence'\)\.get\(\)/)
  assert.match(source, /if \(unresolvedCount\(result\) > 0\) \{[\s\S]*recoverFromClassHistory/)
  assert.match(source, /async function recoverFromClassHistory/)
  assert.match(source, /classRef\.collection\('activity'\)\.get\(\)/)
  assert.match(source, /classRef\.collection\('academicEvents'\)\.get\(\)/)
})

test('Supabase identity cache bypasses the class-wide users query only when complete and conflict-free', () => {
  assert.match(source, /supabaseRosterCacheCoversMembers\(cache\.users, memberKeys\)/)
  assert.match(source, /result\.roster\.members\.some\(\(member\) => member\.conflict\)/)
  assert.match(source, /if \(!cacheCanServeRoster\(\{ cache: supabaseCache, memberKeys, result \}\)\) \{/)
  assert.match(source, /db\.collection\('users'\)\.where\('classId', '==', classId\)\.get\(\)/)
  assert.match(source, /mergeRosterUsers\(firestoreUsers, supabaseCache\.users\)/)
})

test('quota-safe roster endpoint preserves response compatibility and reports cache sources', () => {
  for (const marker of [
    'legacyMemberCount',
    'total: result.roster.total',
    'online: result.roster.online',
    'unresolved,',
    'recoveredFromHistory',
    'members: result.roster.members',
    'identitySource,',
    'presenceSource,',
    'historicalRecoveryUsed,',
  ]) assert.match(source, new RegExp(marker))
  assert.match(source, /Cache-Control', 'no-store'/)
  assert.match(source, /error: 'missing_auth'/)
})
