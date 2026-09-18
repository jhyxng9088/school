import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const srcRoot = resolve(root, 'src')
const sourceFiles = readdirSync(srcRoot)
  .filter((name) => /\.(?:js|jsx)$/.test(name))
  .sort()

// These are frozen pre-existing sites, not approved patterns for new work.
// Counts may decrease as legacy code is retired, but must never increase.
const GRANDFATHERED_MUTATION_OBSERVER_COUNTS = new Map([
  ['push-client.js', 1],
])

const GRANDFATHERED_BUILD_PATCHES = new Set([
  'e2e-board-fixture-patch.js',
  'preview-ai-live-context-patch.js',
  'preview-ai-page-patch.js',
  'preview-ai-stage-motion-patch.js',
  'preview-board-all-patch.js',
  'preview-board-patch.js',
  'preview-board-section-management-patch.js',
  'preview-class-top-segment-patch.js',
  'preview-fast-cache-patch.js',
  'preview-nav-responsiveness-patch.js',
  'preview-nested-geometry-coupling-patch.js',
  'preview-nested-station-reaction-patch.js',
  'preview-physical-class-coupling-patch.js',
  'preview-schedule-top-segment-patch.js',
  'preview-station-jelly-motion-patch.js',
  'preview-station-nav-patch.js',
  'preview-station-nav-refine-patch.js',
  'preview-study-patch.js',
  'preview-study-unified-ui-patch.js',
  'preview-unified-station-physics-patch.js',
  'study-visual-polish-patch.js',
])

test('new MutationObserver ownership is not added beyond frozen legacy sites', () => {
  const offenders = []
  for (const name of sourceFiles) {
    const source = readFileSync(resolve(srcRoot, name), 'utf8')
    const count = (source.match(/\bMutationObserver\b/g) || []).length
    if (!count) continue
    const allowedCount = GRANDFATHERED_MUTATION_OBSERVER_COUNTS.get(name) || 0
    if (count > allowedCount) offenders.push(`${name}:${count}>${allowedCount}`)
  }
  assert.deepEqual(offenders, [])
})

test('new build-time source patch owners are not added', () => {
  const unexpected = sourceFiles
    .filter((name) => /-patch\.js$/.test(name))
    .filter((name) => !GRANDFATHERED_BUILD_PATCHES.has(name))
  assert.deepEqual(unexpected, [])
})


test('grandfathered build patch allowlist contains only files that still exist', () => {
  const existing = new Set(sourceFiles.filter((name) => /-patch\.js$/.test(name)))
  const stale = [...GRANDFATHERED_BUILD_PATCHES].filter((name) => !existing.has(name)).sort()
  assert.deepEqual(stale, [])
})
