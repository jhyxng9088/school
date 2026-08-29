const MAX_STUDENT_NUMBER = 60

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 20)
}

function hash32(value, seed) {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
    hash ^= hash >>> 13
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function classNumberFromId(classId) {
  const match = /^class-([1-9]|[12][0-9]|30)$/.exec(String(classId || '').trim())
  return match ? Number(match[1]) : 0
}

export function studentKeyForRosterIdentity({ classNumber, studentNumber, name } = {}) {
  const safeClass = Number(classNumber)
  const safeStudent = Number(studentNumber)
  const safeName = normalizeName(name)
  if (!Number.isInteger(safeClass) || safeClass < 1 || safeClass > 30) return ''
  if (!Number.isInteger(safeStudent) || safeStudent < 1 || safeStudent > MAX_STUDENT_NUMBER) return ''
  if (!safeName) return ''
  const compactName = safeName.toLowerCase().replace(/\s+/g, '')
  const identity = `${safeClass}|${safeStudent}|${compactName}`
  return `student-${hash32(identity, 2166136261)}${hash32(identity, 2246822519)}`
}

export function inferStudentNumber({ classId, studentKey, name } = {}) {
  const classNumber = classNumberFromId(classId)
  const safeKey = String(studentKey || '').trim()
  const safeName = normalizeName(name)
  if (!classNumber || !safeKey || !safeName) return 0

  for (let studentNumber = 1; studentNumber <= MAX_STUDENT_NUMBER; studentNumber += 1) {
    if (studentKeyForRosterIdentity({ classNumber, studentNumber, name: safeName }) === safeKey) {
      return studentNumber
    }
  }
  return 0
}

function numericTime(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function candidateKey(name) {
  return normalizeName(name).toLowerCase().replace(/\s+/g, '')
}

export function recoverClassRosterUsers({
  classId,
  memberKeys = [],
  users = [],
  activities = [],
  academicEvents = [],
} = {}) {
  const safeClassId = String(classId || '').trim()
  const safeMemberKeys = new Set(
    Array.from(memberKeys || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )
  const candidatesByStudentKey = new Map()

  function addCandidate(studentKey, name, source, createdAt = 0, updatedAt = 0) {
    const safeKey = String(studentKey || '').trim()
    const safeName = normalizeName(name)
    if (!safeMemberKeys.has(safeKey) || !safeName) return
    if (!candidatesByStudentKey.has(safeKey)) candidatesByStudentKey.set(safeKey, [])
    candidatesByStudentKey.get(safeKey).push({
      name: safeName,
      source,
      createdAt: numericTime(createdAt),
      updatedAt: numericTime(updatedAt),
    })
  }

  for (const user of Array.isArray(users) ? users : []) {
    if (String(user?.classId || '').trim() !== safeClassId) continue
    addCandidate(user?.studentKey, user?.name, 'user', user?.createdAt, user?.updatedAt)
  }

  for (const activity of Array.isArray(activities) ? activities : []) {
    addCandidate(
      activity?.actorStudentKey,
      activity?.actorName,
      'activity',
      activity?.updatedAt,
      activity?.updatedAt,
    )
  }

  for (const event of Array.isArray(academicEvents) ? academicEvents : []) {
    addCandidate(
      event?.creatorStudentKey,
      event?.creatorName,
      'academic',
      event?.createdAt,
      event?.updatedAt,
    )
    addCandidate(
      event?.lastEditedByStudentKey,
      event?.lastEditedByName,
      'academic',
      event?.createdAt,
      event?.updatedAt,
    )
  }

  const sourcePriority = { user: 0, activity: 1, academic: 2 }
  const recoveredUsers = []
  const unresolvedKeys = []
  const recoveredFromHistory = []

  for (const studentKey of safeMemberKeys) {
    const rawCandidates = candidatesByStudentKey.get(studentKey) || []
    const uniqueCandidates = new Map()
    for (const candidate of rawCandidates) {
      const key = candidateKey(candidate.name)
      if (!key) continue
      const existing = uniqueCandidates.get(key)
      if (!existing || (sourcePriority[candidate.source] ?? 9) < (sourcePriority[existing.source] ?? 9)) {
        uniqueCandidates.set(key, candidate)
      }
    }

    const resolved = [...uniqueCandidates.values()]
      .map((candidate) => ({
        ...candidate,
        studentNumber: inferStudentNumber({ classId: safeClassId, studentKey, name: candidate.name }),
      }))
      .filter((candidate) => candidate.studentNumber > 0)
      .sort((a, b) => {
        const sourceDifference = (sourcePriority[a.source] ?? 9) - (sourcePriority[b.source] ?? 9)
        if (sourceDifference) return sourceDifference
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
        return b.updatedAt - a.updatedAt
      })

    if (!resolved.length) {
      unresolvedKeys.push(studentKey)
      continue
    }

    const primary = resolved[0]
    recoveredUsers.push({
      classId: safeClassId,
      studentKey,
      name: primary.name,
      createdAt: primary.createdAt,
      updatedAt: Math.max(...resolved.map((candidate) => candidate.updatedAt), 0),
    })
    if (primary.source !== 'user') recoveredFromHistory.push(studentKey)
  }

  return {
    users: recoveredUsers,
    unresolvedKeys,
    recoveredFromHistory,
  }
}

export function buildClassRoster({
  classId,
  users = [],
  presence = [],
  nowMs = Date.now(),
  activeMs = 45_000,
} = {}) {
  const safeClassId = String(classId || '').trim()
  const threshold = Number(nowMs) - Number(activeMs)
  const activeStudentKeys = new Set(
    (Array.isArray(presence) ? presence : [])
      .filter((entry) => numericTime(entry?.lastSeenMs) >= threshold)
      .map((entry) => String(entry?.studentKey || '').trim())
      .filter(Boolean),
  )

  // Anonymous auth creates one users document per device. The deterministic
  // studentKey is the stable identity, so identical profiles across devices
  // must collapse to one student before grouping by class number.
  const uniqueByStudentKey = new Map()
  let unresolved = 0

  for (const raw of Array.isArray(users) ? users : []) {
    const entryClassId = String(raw?.classId || '').trim()
    const studentKey = String(raw?.studentKey || '').trim()
    const name = normalizeName(raw?.name)
    if (entryClassId !== safeClassId || !studentKey || !name) continue

    const studentNumber = inferStudentNumber({ classId: safeClassId, studentKey, name })
    if (!studentNumber) {
      unresolved += 1
      continue
    }

    const candidate = {
      studentKey,
      studentNumber,
      name,
      createdAt: numericTime(raw?.createdAt),
      updatedAt: numericTime(raw?.updatedAt),
      online: activeStudentKeys.has(studentKey),
    }
    const existing = uniqueByStudentKey.get(studentKey)
    if (!existing) {
      uniqueByStudentKey.set(studentKey, candidate)
      continue
    }

    uniqueByStudentKey.set(studentKey, {
      ...existing,
      createdAt: existing.createdAt && candidate.createdAt
        ? Math.min(existing.createdAt, candidate.createdAt)
        : existing.createdAt || candidate.createdAt,
      updatedAt: Math.max(existing.updatedAt, candidate.updatedAt),
      online: existing.online || candidate.online,
    })
  }

  const byNumber = new Map()
  for (const student of uniqueByStudentKey.values()) {
    if (!byNumber.has(student.studentNumber)) byNumber.set(student.studentNumber, [])
    byNumber.get(student.studentNumber).push(student)
  }

  const members = [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([studentNumber, entries]) => {
      const sorted = [...entries].sort((a, b) => {
        const aCreated = a.createdAt || Number.MAX_SAFE_INTEGER
        const bCreated = b.createdAt || Number.MAX_SAFE_INTEGER
        if (aCreated !== bCreated) return aCreated - bCreated
        if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
        return a.name.localeCompare(b.name, 'ko')
      })
      const primary = sorted[0]
      const aliases = [...new Set(sorted.map((entry) => entry.name))]
      return {
        studentNumber,
        name: primary.name,
        online: sorted.some((entry) => entry.online),
        conflict: sorted.length > 1,
        aliases,
      }
    })

  return {
    classId: safeClassId,
    total: members.length,
    online: members.filter((member) => member.online).length,
    unresolved,
    members,
  }
}
