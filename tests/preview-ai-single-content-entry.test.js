import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

function patchMain(source) {
  return patchPreviewAIStageMotionSource(
    `/* s-hub-ai-nav-progress */\n${source}`,
    '/workspace/src/main.jsx',
  )
}

test('enhanced AI station removes the stale duplicate content entry', () => {
  const source = `  const content = {\n    ai: (\n      <PreviewAIPage\n        context={aiContext}\n        onImportItems={importAIItems}\n        onWorkingChange={setAiWorking}\n      />\n    ),\n    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,\n    study: <PreviewStudyPage requireOnline={requireOnline} />,\n  }\n`

  const output = patchMain(source)
  assert.equal((output.match(/\n\s*ai:/g) || []).length, 1)
  assert.doesNotMatch(output, /ai: <PreviewAIPage onOpenAI=/)
  assert.match(output, /onWorkingChange=\{setAiWorking\}/)
})

test('stale AI entry is never removed unless the enhanced station is present', () => {
  const source = `  const content = {\n    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,\n  }\n`
  assert.throws(
    () => patchMain(source),
    /before the enhanced AI station was wired/,
  )
})
