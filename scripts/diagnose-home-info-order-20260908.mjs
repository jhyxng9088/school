import fs from 'node:fs'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'
import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'
import { patchPreviewReminderPolishSource } from '../src/preview-reminder-polish-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchPreviewStationNavRefinementSource } from '../src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from '../src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from '../src/preview-nested-station-reaction-patch.js'
import { patchPreviewUnifiedStationPhysicsSource } from '../src/preview-unified-station-physics-patch.js'
import { patchPreviewPhysicalClassCouplingSource } from '../src/preview-physical-class-coupling-patch.js'
import { patchPreviewNestedGeometryCouplingSource } from '../src/preview-nested-geometry-coupling-patch.js'
import { patchPreviewNavResponsivenessSource } from '../src/preview-nav-responsiveness-patch.js'
import { patchPreviewClassTopSegmentSource } from '../src/preview-class-top-segment-patch.js'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'
import { patchPreviewFastCacheSource } from '../src/preview-fast-cache-patch.js'
import { patchPreviewScheduleTopSegmentSource } from '../src/preview-schedule-top-segment-patch.js'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'
import { patchPreviewHomeInfoSource } from '../src/preview-home-info-patch.js'
import { patchPreviewBoardAllSource } from '../src/preview-board-all-patch.js'
import { patchPreviewBoardSectionManagementSource } from '../src/preview-board-section-management-patch.js'
import { patchPreviewStudyUnifiedUISource } from '../src/preview-study-unified-ui-patch.js'
import { patchPreviewAILiveContextSource } from '../src/preview-ai-live-context-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'

const id = '/workspace/src/main.jsx'
const raw = fs.readFileSync('src/main.jsx', 'utf8')
const steps = [
  ['nav-spring', patchPreviewNavSpringSource],
  ['s-hub-v2', patchPreviewSHubV2Source],
  ['ai-reminder-summary', patchPreviewAIReminderSummarySource],
  ['reminder-polish', patchPreviewReminderPolishSource],
  ['station-nav', patchPreviewStationNavSource],
  ['station-nav-refine', patchPreviewStationNavRefinementSource],
  ['station-jelly-motion', patchPreviewStationJellyMotionSource],
  ['nested-station-reaction', patchPreviewNestedStationReactionSource],
  ['unified-station-physics', patchPreviewUnifiedStationPhysicsSource],
  ['physical-class-coupling', patchPreviewPhysicalClassCouplingSource],
  ['nested-geometry-coupling', patchPreviewNestedGeometryCouplingSource],
  ['nav-responsiveness', patchPreviewNavResponsivenessSource],
  ['class-top-segment', patchPreviewClassTopSegmentSource],
  ['board', patchPreviewBoardSource],
  ['study', patchPreviewStudySource],
  ['fast-cache', patchPreviewFastCacheSource],
  ['schedule-top-segment', patchPreviewScheduleTopSegmentSource],
  ['ai-page', patchPreviewAIPageSource],
  ['ai-stage-motion', patchPreviewAIStageMotionSource],
  ['board-all', patchPreviewBoardAllSource],
  ['board-section-management', patchPreviewBoardSectionManagementSource],
  ['study-unified-ui', patchPreviewStudyUnifiedUISource],
  ['ai-live-context', patchPreviewAILiveContextSource],
  ['study-visual-polish', patchStudyVisualPolishSource],
]

function firstMismatch(a, b) {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a[index] === b[index]) index += 1
  if (index === a.length && index === b.length) return null
  const line = a.slice(0, index).split('\n').length
  const start = Math.max(0, index - 500)
  const endA = Math.min(a.length, index + 1200)
  const endB = Math.min(b.length, index + 1200)
  return {
    index,
    line,
    aLength: a.length,
    bLength: b.length,
    expectedSnippet: a.slice(start, endA),
    migratedSnippet: b.slice(start, endB),
  }
}

let baseline = raw
let migrated = patchPreviewHomeInfoSource(raw, id)
const report = []

function compare(label) {
  let expected
  try {
    expected = patchPreviewHomeInfoSource(baseline, id)
  } catch (error) {
    report.push({ label, comparable: false, error: String(error?.message || error) })
    return false
  }
  const mismatch = firstMismatch(expected, migrated)
  report.push({
    label,
    comparable: true,
    equal: mismatch === null,
    baselineLength: baseline.length,
    expectedLength: expected.length,
    migratedLength: migrated.length,
    mismatch,
  })
  return mismatch === null
}

compare('raw')
let firstDivergence = null
for (const [label, patch] of steps) {
  baseline = patch(baseline, id)
  migrated = patch(migrated, id)
  const equal = compare(label)
  if (!equal && !firstDivergence) firstDivergence = label
}

const baselineFinal = patchPreviewHomeInfoSource(baseline, id)
const finalMismatch = firstMismatch(baselineFinal, migrated)
const output = {
  firstDivergence,
  finalEqual: finalMismatch === null,
  finalMismatch,
  report,
}
fs.writeFileSync('/tmp/home-info-order-diagnostic.json', JSON.stringify(output, null, 2))
console.log(JSON.stringify(output, null, 2))
if (!firstDivergence) {
  console.log('No patch-order divergence found in feature chain.')
}
