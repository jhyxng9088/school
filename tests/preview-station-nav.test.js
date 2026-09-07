import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStationNavRefinementSource } from '../src/preview-station-nav-refine-patch.js'

const patch = fs.readFileSync(new URL('../src/preview-station-nav-patch.js', import.meta.url), 'utf8')
const refinement = fs.readFileSync(new URL('../src/preview-station-nav-refine-patch.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

const LEGACY_TIMETABLE_REVALIDATION_EFFECT = `  useEffect(() => {
    if (!timetableActivityRevision || navigator.onLine === false) return
    refreshSharedTimetable()
  }, [timetableActivityRevision, refreshSharedTimetable])

`

test('preview station has the requested five top-level items in order', () => {
  const sequence = [
    "{ id: 'home', label: '홈' }",
    "{ id: 'class', label: '우리반' }",
    "{ id: 'ai', label: 'AI' }",
    "{ id: 'study', label: '스터디' }",
    "{ id: 'schedule', label: '일정' }",
  ]
  let cursor = -1
  for (const marker of sequence) {
    const next = patch.indexOf(marker, cursor + 1)
    assert.ok(next > cursor, `missing or out-of-order station item: ${marker}`)
    cursor = next
  }
})

test('class station expands into a nested timetable-board capsule', () => {
  assert.match(patch, /classNavExpanded/)
  assert.match(patch, /class-nav-capsule/)
  assert.match(patch, /class-nav-mini-pill/)
  assert.match(patch, /classSection === 'board'/)
  assert.match(patch, /setClassSection\('timetable'\)/)
  assert.match(patch, /setClassSection\('board'\)/)
  assert.match(patch, /<Icon type="timetable" size=\{20\}/)
  assert.match(patch, /<Icon type="board" size=\{20\}/)
})

test('station nav composes directly with source-owned timetable output', () => {
  const path = new URL('../src/main.jsx', import.meta.url).pathname
  assert.equal(main.includes(LEGACY_TIMETABLE_REVALIDATION_EFFECT), false)
  assert.match(main, /  const aiContext = useMemo\(\(\) => \{/)

  const sourceOwnedOutput = patchPreviewStationNavSource(main, path)
  assert.match(sourceOwnedOutput, /setClassNavExpanded\(true\)/)
  assert.match(sourceOwnedOutput, /const aiContext = useMemo/)
  assert.equal(sourceOwnedOutput.includes(LEGACY_TIMETABLE_REVALIDATION_EFFECT), false)
})

test('station refinement composes directly with source-owned timetable output', () => {
  const path = new URL('../src/main.jsx', import.meta.url).pathname
  const stationOutput = patchPreviewStationNavSource(main, path)
  assert.equal(stationOutput.includes(LEGACY_TIMETABLE_REVALIDATION_EFFECT), false)

  const refinedOutput = patchPreviewStationNavRefinementSource(stationOutput, path)
  assert.match(refinedOutput, /setClassNavCollapsing\(false\)/)
  assert.match(refinedOutput, /classExitTimerRef\.current/)
  assert.match(refinedOutput, /const aiContext = useMemo/)
  assert.equal(refinedOutput.includes(LEGACY_TIMETABLE_REVALIDATION_EFFECT), false)
  assert.equal(refinement.includes('timetableActivityRevision'), false)
})

test('existing timetable and schedule features remain reachable', () => {
  assert.match(patch, /<TimetablePage/)
  assert.match(patch, /<TodoPage/)
  assert.match(patch, /<SharedAcademicPage/)
  assert.match(patch, /<Stage3MealPage/)
})

test('AI reuses the existing S-Hub AI sheet flow', () => {
  assert.match(patch, /if \(nextTab === 'ai'\) setAiOpen\(true\)/)
  assert.match(patch, /<SHubAIOrb size=\{34\}/)
})

test('semantic routes are owned by React state instead of synthetic button clicks after mount', () => {
  assert.match(refinement, /semanticNavigationRef/)
  assert.match(refinement, /window\.SHubNavigation/)
  assert.match(refinement, /navigation\.register/)
  assert.match(refinement, /setClassSection\(route\.section\)/)
  assert.match(refinement, /setScheduleSection\(route\.section\)/)
  assert.match(refinement, /changeTab\(route\.tab\)/)
})

test('preview build wires the station patch only through preview vite transforms', () => {
  assert.match(vite, /patchPreviewStationNavSource/)
  assert.match(vite, /next = patchPreviewStationNavSource\(next, cleanId\)/)
})
