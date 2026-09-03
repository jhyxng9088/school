import { adminAuth, adminDb } from './firebase-admin.js'
import {
  buildClassRoster,
  classNumberFromId,
  inferStudentNumber,
  recoverClassRosterUsers,
} from './class-roster.js'
import {
  loadSupabaseRosterIdentities,
  supabaseRosterCacheCoversMembers,
} from './supabase-roster-cache.js'
import { loadSupabaseClassPresence } from './supabase-presence-cache.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

function mergeRosterUsers(...groups) {
  const unique = new Map()
  for (const user of groups.flat()) {
    const classId = String(user?.classId || '').trim()
    const studentKey = String(user?.studentKey || '').trim()
    const name = String(user?.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 20)
    if (!classId || !studentKey || !name) continue
    const key = `${classId}\u0000${studentKey}\u0000${name}`
    const candidate = {
      ...user,
      classId,
      studentKey,
      name,
      createdAt: Math.max(0, Number(user?.createdAt || 0)),
      updatedAt: Math.max(0, Number(user?.updatedAt || 0)),
    }
    const existing = unique.get(key)
    if (!existing || candidate.updatedAt >= existing.updatedAt) unique.set(key, candidate)
  }
  return [...unique.values()]
}

function rosterFromUsers({ classId, memberKeys, users, presence, nowMs }) {
  const recovery = recoverClassRosterUsers({ classId, memberKeys, users })
  const roster = buildClassRoster({ classId, users: recovery.users, presence, nowMs })
  return { recovery, roster }
}

function unresolvedCount(result) {
  return Number(result?.roster?.unresolved || 0) + Number(result?.recovery?.unresolvedKeys?.length || 0)
}

function cacheCanServeRoster({ cache, memberKeys, result }) {
  if (!cache?.available || !supabaseRosterCacheCoversMembers(cache.users, memberKeys)) return false
  if (unresolvedCount(result) > 0) return false
  return !result.roster.members.some((member) => member.conflict)
}

function rosterMembersWithStudentKeys(classId, result) {
  const keysByNumber = new Map()
  for (const user of Array.isArray(result?.recovery?.users) ? result.recovery.users : []) {
    const studentKey = String(user?.studentKey || '').trim()
    const name = String(user?.name || '').trim()
    const studentNumber = inferStudentNumber({ classId, studentKey, name })
    if (!studentNumber || !studentKey) continue
    if (!keysByNumber.has(studentNumber)) keysByNumber.set(studentNumber, new Set())
    keysByNumber.get(studentNumber).add(studentKey)
  }

  return result.roster.members.map((member) => {
    const keys = [...(keysByNumber.get(member.studentNumber) || [])]
    return {
      ...member,
      studentKey: !member.conflict && keys.length === 1 ? keys[0] : '',
    }
  })
}

async function recoverFromClassHistory({ classRef, classId, memberKeys, users, presence, nowMs }) {
  const [activitySnapshot, academicSnapshot] = await Promise.all([
    classRef.collection('activity').get(),
    classRef.collection('academicEvents').get(),
  ])
  const recovery = recoverClassRosterUsers({
    classId,
    memberKeys,
    users,
    activities: activitySnapshot.docs.map((snapshot) => snapshot.data() || {}),
    academicEvents: academicSnapshot.docs.map((snapshot) => snapshot.data() || {}),
  })
  const roster = buildClassRoster({ classId, users: recovery.users, presence, nowMs })
  return { recovery, roster }
}

export default async function handleClassRosterV2(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'missing_auth',
      message: '로그인 정보를 확인하지 못했어요.',
    })
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const db = adminDb()
    const identity = await db.collection('users').doc(decoded.uid).get()
    if (!identity.exists) {
      return res.status(403).json({
        ok: false,
        error: 'identity_missing',
        message: '학생 정보를 확인하지 못했어요.',
      })
    }

    const identityData = identity.data() || {}
    const classId = String(identityData.classId || '').trim()
    const classNumber = classNumberFromId(classId)
    const studentKey = String(identityData.studentKey || '').trim()
    const name = String(identityData.name || '').trim().slice(0, 20)
    if (!classNumber || !studentKey || !name) {
      return res.status(403).json({
        ok: false,
        error: 'invalid_class',
        message: '반 정보를 확인하지 못했어요.',
      })
    }

    const nowMs = Date.now()
    const classRef = db.collection('classes').doc(classId)
    const [membersSnapshot, supabaseCache, supabasePresence] = await Promise.all([
      classRef.collection('members').get(),
      loadSupabaseRosterIdentities({ token, classId }),
      loadSupabaseClassPresence({ token, classId }),
    ])

    const memberKeys = new Set(
      membersSnapshot.docs
        .map((snapshot) => String(snapshot.id || '').trim())
        .filter(Boolean),
    )

    let presence = supabasePresence?.presence || null
    let presenceSource = 'supabase'
    if (!presence) {
      const presenceSnapshot = await classRef.collection('presence').get()
      presence = presenceSnapshot.docs.map((snapshot) => snapshot.data() || {})
      presenceSource = 'firestore-fallback'
    }

    let result = rosterFromUsers({
      classId,
      memberKeys,
      users: supabaseCache.users,
      presence,
      nowMs,
    })
    let identitySource = 'supabase-cache'
    let historicalRecoveryUsed = false

    if (!cacheCanServeRoster({ cache: supabaseCache, memberKeys, result })) {
      const usersSnapshot = await db.collection('users').where('classId', '==', classId).get()
      const firestoreUsers = usersSnapshot.docs.map((snapshot) => snapshot.data() || {})
      const candidateUsers = mergeRosterUsers(firestoreUsers, supabaseCache.users)
      result = rosterFromUsers({ classId, memberKeys, users: candidateUsers, presence, nowMs })
      identitySource = supabaseCache.users.length ? 'firestore+supabase-cache' : 'firestore'

      if (unresolvedCount(result) > 0) {
        result = await recoverFromClassHistory({
          classRef,
          classId,
          memberKeys,
          users: candidateUsers,
          presence,
          nowMs,
        })
        historicalRecoveryUsed = true
      }
    }

    const unresolved = unresolvedCount(result)
    if (unresolved > 0) {
      console.warn('class-roster-v2 unresolved legacy members', {
        classId,
        legacyMemberCount: memberKeys.size,
        unresolved,
        recoveredFromHistory: result.recovery.recoveredFromHistory.length,
      })
    }

    return res.status(200).json({
      ok: true,
      classId,
      classNumber,
      legacyMemberCount: memberKeys.size,
      total: result.roster.total,
      online: result.roster.online,
      unresolved,
      recoveredFromHistory: result.recovery.recoveredFromHistory.length,
      members: rosterMembersWithStudentKeys(classId, result),
      generatedAt: nowMs,
      cache: {
        identitySource,
        presenceSource,
        historicalRecoveryUsed,
      },
    })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) {
      return res.status(401).json({
        ok: false,
        error: 'invalid_auth',
        message: '로그인 정보가 만료됐어요. 앱을 다시 열어 주세요.',
      })
    }
    console.error('class-roster-v2 failed', { code, message: error?.message })
    return res.status(502).json({
      ok: false,
      error: code || 'class_roster_failed',
      message: '반 정보를 불러오지 못했어요.',
    })
  }
}
