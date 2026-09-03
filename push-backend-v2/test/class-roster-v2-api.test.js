import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const source = readFileSync(new URL('../lib/class-roster-v2-handler.js', import.meta.url), 'utf8')
const entrypoint = readFileSync(new URL('../api/class-roster.js', import.meta.url), 'utf8')
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const oldEntrypointUrl = new URL('../api/class-roster-v2.js', import.meta.url)

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

test('roster response keeps a safe live-presence key only for unambiguous rows', () => {
  assert.match(source, /inferStudentNumber\(\{ classId, studentKey, name \}\)/)
  assert.match(source, /function rosterMembersWithStudentKeys\(classId, result\)/)
  assert.match(source, /studentKey: !member\.conflict && keys\.length === 1 \? keys\[0\] : ''/)
  assert.match(source, /members: rosterMembersWithStudentKeys\(classId, result\)/)
})

test('quota-safe roster endpoint preserves response compatibility and reports cache sources', () => {
  for (const marker of [
    'legacyMemberCount',
    'total: result.roster.total',
    'online: result.roster.online',
    'unresolved,',
    'recoveredFromHistory',
    'members: rosterMembersWithStudentKeys',
    'identitySource,',
    'presenceSource,',
    'historicalRecoveryUsed,',
  ]) assert.match(source, new RegExp(marker))
  assert.match(source, /Cache-Control', 'no-store'/)
  assert.match(source, /error: 'missing_auth'/)
})

test('public class-roster-v2 URL is preserved without creating a thirteenth Vercel function', () => {
  const rewrite = vercel.rewrites.find((item) => item.source === '/api/class-roster-v2')
  assert.deepEqual(rewrite, {
    source: '/api/class-roster-v2',
    destination: '/api/class-roster?mode=v2',
  })
  assert.match(entrypoint, /import handleClassRosterV2 from '\.\.\/lib\/class-roster-v2-handler\.js'/)
  assert.match(entrypoint, /if \(mode === 'v2'\) return handleClassRosterV2\(req, res\)/)
  assert.equal(existsSync(oldEntrypointUrl), false)

  const apiFiles = readdirSync(new URL('../api/', import.meta.url))
    .filter((name) => name.endsWith('.js'))
  assert.ok(apiFiles.length <= 12, `Hobby deployment would contain ${apiFiles.length} serverless functions`)
})
