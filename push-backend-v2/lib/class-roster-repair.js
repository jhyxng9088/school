const DEFAULT_MIN_MEMBER_AGE_MS = 10 * 60 * 1000
const DEFAULT_ACTIVE_PRESENCE_MS = 2 * 60 * 1000

function safeKey(value) {
  return String(value || '').trim()
}

function numericTime(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function keySet(items, readKey) {
  const result = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    const key = safeKey(readKey(item))
    if (key) result.add(key)
  }
  return result
}

export function classifyRosterOrphans({
  unresolvedKeys = [],
  members = [],
  users = [],
  presence = [],
  activities = [],
  academicEvents = [],
  pushSubscriptions = [],
  todoStateKeys = [],
  nowMs = Date.now(),
  minMemberAgeMs = DEFAULT_MIN_MEMBER_AGE_MS,
  activePresenceMs = DEFAULT_ACTIVE_PRESENCE_MS,
} = {}) {
  const now = Number(nowMs)
  const memberByKey = new Map(
    (Array.isArray(members) ? members : [])
      .map((entry) => [safeKey(entry?.studentKey || entry?.id), entry])
      .filter(([key]) => Boolean(key)),
  )
  const userKeys = keySet(users, (entry) => entry?.studentKey)
  const activityKeys = keySet(activities, (entry) => entry?.actorStudentKey)
  const academicKeys = new Set()
  for (const entry of Array.isArray(academicEvents) ? academicEvents : []) {
    const creator = safeKey(entry?.creatorStudentKey)
    const editor = safeKey(entry?.lastEditedByStudentKey)
    if (creator) academicKeys.add(creator)
    if (editor) academicKeys.add(editor)
  }
  const pushKeys = keySet(pushSubscriptions, (entry) => entry?.studentKey)
  const personalStateKeys = new Set(
    (Array.isArray(todoStateKeys) ? todoStateKeys : [])
      .map(safeKey)
      .filter(Boolean),
  )
  const latestPresence = new Map()
  for (const entry of Array.isArray(presence) ? presence : []) {
    const key = safeKey(entry?.studentKey)
    if (!key) continue
    latestPresence.set(key, Math.max(latestPresence.get(key) || 0, numericTime(entry?.lastSeenMs)))
  }

  const archive = []
  const keep = []

  for (const rawKey of Array.from(unresolvedKeys || [])) {
    const studentKey = safeKey(rawKey)
    if (!studentKey) continue
    const member = memberByKey.get(studentKey) || {}
    const joinedAt = numericTime(member?.joinedAt)
    const reasons = []

    if (userKeys.has(studentKey)) reasons.push('user_identity')
    if (activityKeys.has(studentKey) || academicKeys.has(studentKey)) reasons.push('class_history')
    if (pushKeys.has(studentKey)) reasons.push('push_subscription')
    if (personalStateKeys.has(studentKey)) reasons.push('personal_todo_state')

    const lastSeenMs = latestPresence.get(studentKey) || 0
    if (lastSeenMs >= now - Number(activePresenceMs)) reasons.push('recent_presence')
    if (!joinedAt || joinedAt > now - Number(minMemberAgeMs)) reasons.push('recent_or_unknown_join')

    const record = { studentKey, joinedAt, lastSeenMs, reasons }
    if (reasons.length) keep.push(record)
    else archive.push(record)
  }

  return { archive, keep }
}
