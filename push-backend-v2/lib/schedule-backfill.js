export const SCHEDULE_BACKFILL_LOOKBACK_MS = 2 * 60 * 60 * 1000
export const SCHEDULE_BACKFILL_STEP_MS = 5 * 60 * 1000
export const SCHEDULE_BACKFILL_OVERLAP_MS = 10 * 60 * 1000

export function scheduleLookbackMs(lastSuccessMs, nowMs = Date.now()) {
  const now = Number(nowMs)
  const last = Number(lastSuccessMs)
  if (!Number.isFinite(now)) return SCHEDULE_BACKFILL_LOOKBACK_MS
  if (!Number.isFinite(last) || last <= 0 || last > now) return SCHEDULE_BACKFILL_LOOKBACK_MS
  const gap = Math.max(0, now - last)
  return Math.min(
    SCHEDULE_BACKFILL_LOOKBACK_MS,
    Math.max(SCHEDULE_BACKFILL_STEP_MS, gap + SCHEDULE_BACKFILL_OVERLAP_MS),
  )
}

export function recentScheduleCheckpoints(
  nowMs = Date.now(),
  lookbackMs = SCHEDULE_BACKFILL_LOOKBACK_MS,
  stepMs = SCHEDULE_BACKFILL_STEP_MS,
) {
  const now = Number(nowMs)
  const lookback = Math.max(0, Number(lookbackMs) || 0)
  const step = Math.max(60_000, Number(stepMs) || SCHEDULE_BACKFILL_STEP_MS)
  if (!Number.isFinite(now)) return []

  const checkpoints = []
  for (let offset = 0; offset <= lookback; offset += step) {
    checkpoints.push(now - offset)
  }
  return checkpoints
}

export function uniqueScheduledPlans(plans = []) {
  const unique = new Map()
  for (const plan of plans || []) {
    const key = String(plan?.key || '')
    if (!key || unique.has(key)) continue
    unique.set(key, plan)
  }
  return [...unique.values()]
}