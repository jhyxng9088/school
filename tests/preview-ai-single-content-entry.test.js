import test from 'node:test'
import assert from 'node:assert/strict'
import { removeStalePreviewAIContentEntry } from '../src/preview-ai-background-patch.js'

test('enhanced AI station removes the stale duplicate content entry', () => {
  const source = `  const content = {\n    ai: (\n      <PreviewAIPage\n        context={aiContext}\n        onImportItems={importAIItems}\n        onWorkingChange={setAiWorking}\n      />\n    ),\n    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,\n    study: <PreviewStudyPage requireOnline={requireOnline} />,\n  }\n`

  const output = removeStalePreviewAIContentEntry(source)
  assert.equal((output.match(/\n\s*ai:/g) || []).length, 1)
  assert.doesNotMatch(output, /ai: <PreviewAIPage onOpenAI=/)
  assert.match(output, /onWorkingChange=\{setAiWorking\}/)
})

test('stale AI entry is never removed unless the enhanced station is present', () => {
  const source = `  const content = {\n    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,\n  }\n`
  assert.throws(
    () => removeStalePreviewAIContentEntry(source),
    /before the enhanced AI station was wired/,
  )
})
