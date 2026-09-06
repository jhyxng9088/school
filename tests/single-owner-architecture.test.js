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
  ['polite-copy-runtime.js', 2],
  ['push-client.js', 1],
])

const GRANDFATHERED_BUILD_PATCHES = new Set([
  'data-split-v1-patch.js',
  'e2e-board-fixture-patch.js',
  'presence-split-patch.js',
  'preview-ai-background-patch.js',
  'preview-ai-context-layout-patch.js',
  'preview-ai-density-patch.js',
  'preview-ai-live-context-patch.js',
  'preview-ai-page-patch.js',
  'preview-ai-reminder-summary-patch.js',
  'preview-ai-spacing-polish-patch.js',
  'preview-ai-stage-motion-patch.js',
  'preview-board-all-patch.js',
  'preview-board-patch.js',
  'preview-board-section-management-patch.js',
  'preview-class-top-segment-patch.js',
  'preview-class-top-segment-style-patch.js',
  'preview-fast-cache-patch.js',
  'preview-home-info-patch.js',
  'preview-nav-responsiveness-patch.js',
  'preview-nav-spring-patch.js',
  'preview-nested-geometry-coupling-patch.js',
  'preview-nested-station-reaction-patch.js',
  'preview-physical-class-coupling-patch.js',
  'preview-reminder-polish-patch.js',
  'preview-s-hub-v2-patch.js',
  'preview-schedule-top-segment-patch.js',
  'preview-station-jelly-motion-patch.js',
  'preview-station-nav-patch.js',
  'preview-station-nav-refine-patch.js',
  'preview-study-patch.js',
  'preview-study-unified-ui-patch.js',
  'preview-unified-station-physics-patch.js',
  'shared-segment-spring-owner-patch.js',
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
