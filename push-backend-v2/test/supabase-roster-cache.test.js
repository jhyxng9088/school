import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSupabaseRosterIdentities,
  supabaseRosterCacheCoversMembers,
} from '../lib/supabase-roster-cache.js'

test('Supabase roster cache rejects cross-class and malformed identity rows', () => {
  assert.deepEqual(normalizeSupabaseRosterIdentities({
    ok: true,
    classId: 'class-3',
    identities: [{ studentKey: 'student-1234567890123456', name: '테스트' }],
  }, 'class-11'), [])

  const users = normalizeSupabaseRosterIdentities({
    ok: true,
    classId: 'class-3',
    identities: [
      { studentKey: 'short', name: '무시' },
      { studentKey: 'student-1234567890123456', name: '  김 학생  ', verifiedAt: 10, updatedAt: 20 },
      { studentKey: 'student-1234567890123456', name: '김 학생', verifiedAt: 10, updatedAt: 30 },
    ],
  }, 'class-3')

  assert.equal(users.length, 1)
  assert.equal(users[0].classId, 'class-3')
  assert.equal(users[0].studentKey, 'student-1234567890123456')
  assert.equal(users[0].name, '김 학생')
  assert.equal(users[0].updatedAt, 30)
})

test('Supabase roster cache is complete only when every registered member key is covered', () => {
  const users = [
    { studentKey: 'student-aaaaaaaaaaaaaaaa' },
    { studentKey: 'student-bbbbbbbbbbbbbbbb' },
  ]
  assert.equal(supabaseRosterCacheCoversMembers(users, new Set([
    'student-aaaaaaaaaaaaaaaa',
    'student-bbbbbbbbbbbbbbbb',
  ])), true)
  assert.equal(supabaseRosterCacheCoversMembers(users, new Set([
    'student-aaaaaaaaaaaaaaaa',
    'student-cccccccccccccccc',
  ])), false)
  assert.equal(supabaseRosterCacheCoversMembers(users, new Set()), false)
})
