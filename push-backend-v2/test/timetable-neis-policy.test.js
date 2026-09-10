import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyManualWeeklyOverrides,
  buildNeisTimetableSyncState,
  manualOverridesFromDifference,
  reconcileManualWeeklyOverrides,
} from '../lib/timetable-neis-policy.js'

function schedule(overrides = {}) {
  return {
    mon: { 1: '국어', 2: '영어', 3: '수학', 4: '과학', 5: '체육', 6: '정보', ...(overrides.mon || {}) },
    tue: { 1: '영어', 2: '수학', 3: '과학', 4: '국어', 5: '정보', 6: '체육', ...(overrides.tue || {}) },
    wed: { 1: '수학', 2: '과학', 3: '국어', 4: '영어', 5: '체육', 6: '정보', 7: '진로', ...(overrides.wed || {}) },
    thu: { 1: '과학', 2: '국어', 3: '영어', 4: '수학', 5: '정보', 6: '체육', ...(overrides.thu || {}) },
    fri: { 1: '정보', 2: '체육', 3: '수학', 4: '과학', 5: '국어', 6: '영어', 7: '자율', ...(overrides.fri || {}) },
  }
}

test('manual override replaces only the edited cell', () => {
  const merged = applyManualWeeklyOverrides(schedule(), { mon: { 2: '미적분' } })
  assert.equal(merged.mon[2], '미적분')
  assert.equal(merged.mon[1], '국어')
  assert.equal(merged.tue[2], '수학')
})

test('a newly edited weekly cell becomes a manual override', () => {
  const manual = reconcileManualWeeklyOverrides(
    schedule(),
    {},
    schedule({ mon: { 2: '미적분' } }),
  )
  assert.deepEqual(manual, { mon: { 2: '미적분' } })
})

test('restoring a manual cell to its NEIS value removes the override', () => {
  const manual = reconcileManualWeeklyOverrides(
    schedule(),
    { mon: { 2: '미적분' } },
    schedule(),
  )
  assert.deepEqual(manual, {})
})

test('new NEIS values update untouched cells while manual cells stay fixed', () => {
  const state = buildNeisTimetableSyncState({
    timetableData: {
      weeklySchedule: schedule({ mon: { 2: '미적분' } }),
      updatedAt: 2000,
    },
    metadata: {
      neisWeeklySchedule: schedule(),
      manualWeeklyOverrides: {},
    },
    neisWeeklySchedule: schedule({ mon: { 1: '문학', 2: '영어회화' }, tue: { 4: '독서' } }),
    lastClientSyncAt: 1000,
  })

  assert.equal(state.weeklySchedule.mon[1], '문학')
  assert.equal(state.weeklySchedule.mon[2], '미적분')
  assert.equal(state.weeklySchedule.tue[4], '독서')
  assert.deepEqual(state.manualWeeklyOverrides, { mon: { 2: '미적분' } })
})

test('legacy weekly edits made after the last client sync survive first migration', () => {
  const nextNeis = schedule({ mon: { 1: '문학' } })
  const legacyEffective = schedule({ mon: { 2: '미적분' } })
  const state = buildNeisTimetableSyncState({
    timetableData: { weeklySchedule: legacyEffective, updatedAt: 5000 },
    metadata: {},
    neisWeeklySchedule: nextNeis,
    lastClientSyncAt: 3000,
  })

  assert.equal(state.weeklySchedule.mon[1], '국어')
  assert.equal(state.weeklySchedule.mon[2], '미적분')
  assert.deepEqual(state.manualWeeklyOverrides, manualOverridesFromDifference(nextNeis, legacyEffective))
})

test('recent legacy edit survives first sync when this device has no NEIS cache yet', () => {
  const legacyEffective = schedule({ mon: { 2: '미적분' } })
  const state = buildNeisTimetableSyncState({
    timetableData: { weeklySchedule: legacyEffective, updatedAt: 10_000 },
    metadata: {},
    neisWeeklySchedule: schedule(),
    lastClientSyncAt: 0,
    now: 11_000,
  })

  assert.equal(state.weeklySchedule.mon[2], '미적분')
  assert.deepEqual(state.manualWeeklyOverrides, { mon: { 2: '미적분' } })
})

test('stale legacy timetable without a client cache still accepts the NEIS base', () => {
  const state = buildNeisTimetableSyncState({
    timetableData: { weeklySchedule: schedule(), updatedAt: 1_000 },
    metadata: {},
    neisWeeklySchedule: schedule({ mon: { 1: '문학' } }),
    lastClientSyncAt: 0,
    now: 7 * 60 * 60 * 1000,
  })

  assert.equal(state.weeklySchedule.mon[1], '문학')
  assert.deepEqual(state.manualWeeklyOverrides, {})
})

test('legacy timetable without later edits accepts the new NEIS base', () => {
  const state = buildNeisTimetableSyncState({
    timetableData: { weeklySchedule: schedule(), updatedAt: 3000 },
    metadata: {},
    neisWeeklySchedule: schedule({ mon: { 1: '문학' } }),
    lastClientSyncAt: 3000,
  })

  assert.equal(state.weeklySchedule.mon[1], '문학')
  assert.deepEqual(state.manualWeeklyOverrides, {})
})

test('handler stores NEIS metadata outside the client timetable document', () => {
  const source = fs.readFileSync(new URL('../lib/timetable-neis-sync-handler.js', import.meta.url), 'utf8')
  const timetableWrite = source.match(
    /transaction\.set\(timetableRef,\s*\{([\s\S]*?)\}\s*,\s*\{\s*merge:\s*true\s*\}\)/,
  )?.[1] || ''
  const metadataWrite = source.match(
    /transaction\.set\(metadataRef,\s*\{([\s\S]*?)\}\s*,\s*\{\s*merge:\s*true\s*\}\)/,
  )?.[1] || ''

  assert.match(source, /doc\('timetableNeisState'\)/)
  assert.match(timetableWrite, /weeklySchedule: next\.weeklySchedule/)
  assert.match(timetableWrite, /updatedAt: now/)
  assert.doesNotMatch(timetableWrite, /neisWeeklySchedule|manualWeeklyOverrides/)
  assert.match(metadataWrite, /neisWeeklySchedule: next\.neisWeeklySchedule/)
  assert.match(metadataWrite, /manualWeeklyOverrides: next\.manualWeeklyOverrides/)
})

test('public NEIS sync URL shares the existing timetable function', () => {
  const entrypoint = fs.readFileSync(new URL('../api/personal-timetable.js', import.meta.url), 'utf8')
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const oldEntrypoint = new URL('../api/timetable-neis-sync.js', import.meta.url)
  const rewrite = vercel.rewrites.find((item) => item.source === '/api/timetable-neis-sync')

  assert.deepEqual(rewrite, {
    source: '/api/timetable-neis-sync',
    destination: '/api/personal-timetable?mode=neis-sync',
  })
  assert.match(entrypoint, /import handleTimetableNeisSync from '\.\.\/lib\/timetable-neis-sync-handler\.js'/)
  assert.match(entrypoint, /if \(mode === 'neis-sync'\) return handleTimetableNeisSync\(req, res\)/)
  assert.equal(fs.existsSync(oldEntrypoint), false)
})
