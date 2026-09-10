const PERIOD_COUNTS = {
  mon: 6,
  tue: 6,
  wed: 7,
  thu: 6,
  fri: 7,
}

function normalizeSubject(value) {
  return typeof value === 'string' ? value.slice(0, 20) : ''
}

export function normalizeWeeklySchedule(value) {
  const source = value && typeof value === 'object' ? value : {}
  const normalized = {}

  for (const [dayId, periodCount] of Object.entries(PERIOD_COUNTS)) {
    normalized[dayId] = {}
    for (let period = 1; period <= periodCount; period += 1) {
      normalized[dayId][period] = normalizeSubject(source?.[dayId]?.[period])
    }
  }

  return normalized
}

export function normalizeManualWeeklyOverrides(value) {
  const source = value && typeof value === 'object' ? value : {}
  const normalized = {}

  for (const [dayId, periodCount] of Object.entries(PERIOD_COUNTS)) {
    const sourceDay = source?.[dayId]
    if (!sourceDay || typeof sourceDay !== 'object') continue

    const day = {}
    for (let period = 1; period <= periodCount; period += 1) {
      if (!Object.prototype.hasOwnProperty.call(sourceDay, period)) continue
      day[period] = normalizeSubject(sourceDay[period])
    }
    if (Object.keys(day).length) normalized[dayId] = day
  }

  return normalized
}

export function applyManualWeeklyOverrides(baseSchedule, manualOverrides) {
  const merged = normalizeWeeklySchedule(baseSchedule)
  const manual = normalizeManualWeeklyOverrides(manualOverrides)

  for (const [dayId, periods] of Object.entries(manual)) {
    for (const [period, subject] of Object.entries(periods)) {
      merged[dayId][period] = subject
    }
  }

  return merged
}

export function reconcileManualWeeklyOverrides(previousBase, previousManual, currentEffective) {
  const base = normalizeWeeklySchedule(previousBase)
  const manual = normalizeManualWeeklyOverrides(previousManual)
  const current = normalizeWeeklySchedule(currentEffective)
  const expected = applyManualWeeklyOverrides(base, manual)
  const next = normalizeManualWeeklyOverrides(manual)

  for (const [dayId, periodCount] of Object.entries(PERIOD_COUNTS)) {
    for (let period = 1; period <= periodCount; period += 1) {
      if (current[dayId][period] === expected[dayId][period]) continue

      if (current[dayId][period] === base[dayId][period]) {
        if (next[dayId]) {
          delete next[dayId][period]
          if (!Object.keys(next[dayId]).length) delete next[dayId]
        }
      } else {
        if (!next[dayId]) next[dayId] = {}
        next[dayId][period] = current[dayId][period]
      }
    }
  }

  return next
}

export function manualOverridesFromDifference(baseSchedule, effectiveSchedule) {
  const base = normalizeWeeklySchedule(baseSchedule)
  const effective = normalizeWeeklySchedule(effectiveSchedule)
  const manual = {}

  for (const [dayId, periodCount] of Object.entries(PERIOD_COUNTS)) {
    for (let period = 1; period <= periodCount; period += 1) {
      if (effective[dayId][period] === base[dayId][period]) continue
      if (!manual[dayId]) manual[dayId] = {}
      manual[dayId][period] = effective[dayId][period]
    }
  }

  return manual
}

export function buildNeisTimetableSyncState({
  timetableData,
  metadata,
  neisWeeklySchedule,
  lastClientSyncAt = 0,
}) {
  const timetable = timetableData && typeof timetableData === 'object' ? timetableData : {}
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const nextBase = normalizeWeeklySchedule(neisWeeklySchedule)
  const hasCurrentEffective = timetable.weeklySchedule && typeof timetable.weeklySchedule === 'object'
  const hasPreviousBase = meta.neisWeeklySchedule && typeof meta.neisWeeklySchedule === 'object'

  let manual = normalizeManualWeeklyOverrides(meta.manualWeeklyOverrides)

  if (hasPreviousBase && hasCurrentEffective) {
    manual = reconcileManualWeeklyOverrides(
      meta.neisWeeklySchedule,
      manual,
      timetable.weeklySchedule,
    )
  } else if (hasCurrentEffective) {
    const documentUpdatedAt = Number(timetable.updatedAt || 0)
    const previousClientSyncAt = Number(lastClientSyncAt || 0)
    const legacyWasEditedAfterLastSync = previousClientSyncAt > 0
      && documentUpdatedAt > previousClientSyncAt + 1000

    if (legacyWasEditedAfterLastSync) {
      manual = manualOverridesFromDifference(nextBase, timetable.weeklySchedule)
    }
  }

  return {
    weeklySchedule: applyManualWeeklyOverrides(nextBase, manual),
    neisWeeklySchedule: nextBase,
    manualWeeklyOverrides: manual,
  }
}
