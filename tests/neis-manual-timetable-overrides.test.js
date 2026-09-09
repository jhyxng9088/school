import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyManualWeeklyOverrides,
  buildNeisTimetableSyncState,
  manualOverridesFromDifference,
  reconcileManualWeeklyOverrides,
} from '../src/timetable-neis-policy.js'

function schedule(overrides = {}) {
  return {
    mon: { 1: '국어', 2: '영어', 3: '수학', 4: '과학', 5: '체육', 6: '정보', ...(overrides.mon || {}) },
    tue: { 1: '영어', 2: '수학', 3: '과학', 4: '국어', 5: '정보', 6: '체육', ...(overrides.tue || {}) },
    wed: { 1: '수학', 2: '과학', 3: '국어', 4: '영어', 5: '체육', 6: '정보', 7: '진로', ...(overrides.wed || {}) },
    thu: { 1: '과학', 2: '국어', 3: '영어', 4: '수학', 5: '정보', 6: '체육', ...(overrides.thu || {}) },
    fri: { 1: '정보', 2: '체육', 3: '수학', 4: '과학', 5: '국어', 6: '영어', 7: '자율', ...(overrides.fri || {}) },
  }
}

test('manual override replaces only its edited cell', () => {
  const base = schedule()
  const merged = applyManualWeeklyOverrides(base, { mon: { 2: '미적분' } })

  assert.equal(merged.mon[2], '미적분')
  assert.equal(merged.mon[1], '국어')
  assert.equal(merged.tue[2], '수학')
})

test('new manual edits are detected relative to the previous NEIS base', () => {
  const base = schedule()
  const current = schedule({ mon: { 2: '미적분' } })
  const manual = reconcileManualWeeklyOverrides(base, {}, current)

  assert.deepEqual(manual, { mon: { 2: '미적분' } })
})

test('editing a manual cell back to the NEIS value removes its override', () => {
  const base = schedule()
  const manual = { mon: { 2: '미적분' } }
  const current = schedule()
  const next = reconcileManualWeeklyOverrides(base, manual, current)

  assert.deepEqual(next, {})
})

test('later NEIS changes update untouched cells but preserve manual cells', () => {
  const previousBase = schedule()
  const current = schedule({ mon: { 2: '미적분' } })
  const nextNeis = schedule({ mon: { 1: '문학', 2: '영어회화' }, tue: { 4: '독서' } })

  const state = buildNeisTimetableSyncState({
    documentData: {
      weeklySchedule: current,
      neisWeeklySchedule: previousBase,
      manualWeeklyOverrides: {},
      updatedAt: 2000,
    },
    neisWeeklySchedule: nextNeis,
    lastClientSyncAt: 1000,
  })

  assert.equal(state.weeklySchedule.mon[1], '문학')
  assert.equal(state.weeklySchedule.mon[2], '미적분')
  assert.equal(state.weeklySchedule.tue[4], '독서')
  assert.deepEqual(state.manualWeeklyOverrides, { mon: { 2: '미적분' } })
})

test('legacy timetable edited after the last client sync is preserved on first migration', () => {
  const nextNeis = schedule({ mon: { 1: '문학' } })
  const legacyEffective = schedule({ mon: { 2: '미적분' } })

  const state = buildNeisTimetableSyncState({
    documentData: {
      weeklySchedule: legacyEffective,
      updatedAt: 5000,
    },
    neisWeeklySchedule: nextNeis,
    lastClientSyncAt: 3000,
  })

  assert.equal(state.weeklySchedule.mon[1], '국어')
  assert.equal(state.weeklySchedule.mon[2], '미적분')
  assert.deepEqual(
    state.manualWeeklyOverrides,
    manualOverridesFromDifference(nextNeis, legacyEffective),
  )
})

test('legacy timetable without evidence of a later manual edit accepts the new NEIS base', () => {
  const legacy = schedule()
  const nextNeis = schedule({ mon: { 1: '문학' } })

  const state = buildNeisTimetableSyncState({
    documentData: {
      weeklySchedule: legacy,
      updatedAt: 3000,
    },
    neisWeeklySchedule: nextNeis,
    lastClientSyncAt: 3000,
  })

  assert.equal(state.weeklySchedule.mon[1], '문학')
  assert.deepEqual(state.manualWeeklyOverrides, {})
})
