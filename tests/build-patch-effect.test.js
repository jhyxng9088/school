import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const srcDir = resolve(root, 'src')

const prefix = [
  ['patchPreviewNavSpringSource', 'preview-nav-spring-patch.js'],
  ['patchPreviewSHubV2Source', 'preview-s-hub-v2-patch.js'],
  ['patchPreviewAIReminderSummarySource', 'preview-ai-reminder-summary-patch.js'],
  ['patchPreviewReminderPolishSource', 'preview-reminder-polish-patch.js'],
  ['patchPreviewStationNavSource', 'preview-station-nav-patch.js'],
  ['patchPreviewStationNavRefinementSource', 'preview-station-nav-refine-patch.js'],
  ['patchPreviewStationJellyMotionSource', 'preview-station-jelly-motion-patch.js'],
  ['patchPreviewNestedStationReactionSource', 'preview-nested-station-reaction-patch.js'],
  ['patchPreviewUnifiedStationPhysicsSource', 'preview-unified-station-physics-patch.js'],
  ['patchPreviewPhysicalClassCouplingSource', 'preview-physical-class-coupling-patch.js'],
  ['patchPreviewNestedGeometryCouplingSource', 'preview-nested-geometry-coupling-patch.js'],
  ['patchPreviewNavResponsivenessSource', 'preview-nav-responsiveness-patch.js'],
  ['patchPreviewClassTopSegmentSource', 'preview-class-top-segment-patch.js'],
]

const boardOrder = [
  ['patchPreviewBoardSource', 'preview-board-patch.js'],
  ['patchPreviewStudySource', 'preview-study-patch.js'],
  ['patchPreviewFastCacheSource', 'preview-fast-cache-patch.js'],
]

const boardRuntimeOrder = [
  ['patchPreviewFastCacheSource', 'preview-fast-cache-patch.js'],
  ['patchPreviewBoardSource', 'preview-board-patch.js'],
]

const suffix = [
  ['patchPreviewScheduleTopSegmentSource', 'preview-schedule-top-segment-patch.js'],
  ['patchPreviewAIPageSource', 'preview-ai-page-patch.js'],
  ['patchPreviewAIDensitySource', 'preview-ai-density-patch.js'],
  ['patchPreviewAIStageMotionSource', 'preview-ai-stage-motion-patch.js'],
  ['patchPreviewAIBackgroundSource', 'preview-ai-background-patch.js'],
  ['patchPreviewHomeInfoSource', 'preview-home-info-patch.js'],
  ['patchPreviewBoardAllSource', 'preview-board-all-patch.js'],
  ['patchPreviewBoardSectionManagementSource', 'preview-board-section-management-patch.js'],
  ['patchPreviewStudyUnifiedUISource', 'preview-study-unified-ui-patch.js'],
  ['patchPreviewAILiveContextSource', 'preview-ai-live-context-patch.js'],
  ['patchStudyVisualPolishSource', 'study-visual-polish-patch.js'],
]

const definitions = [...prefix, ...boardOrder, ...boardRuntimeOrder, ...suffix]
const uniqueDefinitions = [...new Map(definitions.map((definition) => [definition[0], definition])).values()]

function sourceFiles() {
  return readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|jsx|css)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
}

async function loadDefinitions() {
  const loaded = new Map()
  for (const [functionName, moduleFile] of uniqueDefinitions) {
    const module = await import(new URL(`../src/${moduleFile}`, import.meta.url))
    assert.equal(typeof module[functionName], 'function', `${moduleFile} must export ${functionName}`)
    loaded.set(functionName, {
      functionName,
      moduleFile,
      patch: module[functionName],
    })
  }
  return loaded
}

function sequenceFor(fileName, loaded) {
  const middle = fileName === 'preview-board-client.js' || fileName === 'preview-board-complete.jsx'
    ? boardRuntimeOrder
    : boardOrder
  return [...prefix, ...middle, ...suffix].map(([functionName]) => loaded.get(functionName))
}

test('every direct production build patch still changes at least one current source target', async () => {
  const vite = readFileSync(resolve(root, 'vite.config.js'), 'utf8')
  const loaded = await loadDefinitions()
  const effects = new Map(uniqueDefinitions.map(([functionName]) => [functionName, []]))

  for (const [functionName, moduleFile] of uniqueDefinitions) {
    assert.match(vite, new RegExp(`\\b${functionName}\\b`), `${moduleFile} is no longer a direct production Vite patch`)
  }

  for (const fileName of sourceFiles()) {
    let current = readFileSync(resolve(srcDir, fileName), 'utf8')
    const id = `/workspace/src/${fileName}`

    for (const definition of sequenceFor(fileName, loaded)) {
      const next = definition.patch(current, id)
      if (next !== current) effects.get(definition.functionName).push(fileName)
      current = next
    }
  }

  const noEffect = uniqueDefinitions
    .filter(([functionName]) => effects.get(functionName).length === 0)
    .map(([functionName, moduleFile]) => `${moduleFile}:${functionName}`)

  const report = uniqueDefinitions
    .map(([functionName, moduleFile]) => `${moduleFile} -> ${effects.get(functionName).join(', ') || '(no effect)'}`)
    .join('\n')

  assert.deepEqual(noEffect, [], `Direct production patches with no current effect:\n${noEffect.join('\n')}\n\nEffect report:\n${report}`)
})
