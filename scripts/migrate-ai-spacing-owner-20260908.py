from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


spacing_path = Path('src/preview-ai-spacing-polish-patch.js')
spacing = spacing_path.read_text()
stage_path = Path('src/preview-ai-stage-motion-patch.js')
stage = stage_path.read_text()

# Remove the nested file import first.
stage = replace_once(
    stage,
    "import { patchPreviewAISpacingPolishSource } from './preview-ai-spacing-polish-patch.js'\n",
    '',
    'stage motion spacing import',
)

# Move the exact spacing CSS constant into the stage-motion owner.
constant_end = spacing.index('\n\nfunction replaceRequired')
spacing_constant = spacing[:constant_end]
if 'const AI_SPACING_POLISH_CSS = `' not in spacing_constant or 'Preview-only AI rhythm polish' not in spacing_constant:
    raise SystemExit('spacing CSS constant shape changed unexpectedly')
stage = replace_once(
    stage,
    "import { patchPreviewAIContextLayoutSource } from './preview-ai-context-layout-patch.js'\n\nconst AI_STAGE_MOTION_CSS = `",
    "import { patchPreviewAIContextLayoutSource } from './preview-ai-context-layout-patch.js'\n\n" + spacing_constant + "\n\nconst AI_STAGE_MOTION_CSS = `",
    'stage motion source-owned spacing CSS',
)

# Move the exact spacing patch logic into stage-motion, renaming only local symbols
# to avoid colliding with stage-motion's own patchAISheet helper.
helper_start = spacing.index('function patchAISheet(source) {')
spacing_helper = spacing[helper_start:].rstrip()
spacing_helper = spacing_helper.replace('function patchAISheet(source) {', 'function patchAISpacingPolishSheet(source) {', 1)
spacing_helper = spacing_helper.replace('export function patchPreviewAISpacingPolishSource(source, id = \'\') {', "function patchAISpacingPolishSource(source, id = '') {", 1)
spacing_helper = spacing_helper.replace('return patchAISheet(current)', 'return patchAISpacingPolishSheet(current)', 1)
if 'patchPreviewAISpacingPolishSource' in spacing_helper:
    raise SystemExit('spacing helper rename incomplete')

stage = replace_once(
    stage,
    '\n\nfunction patchAISheet(source) {',
    '\n\n' + spacing_helper + '\n\nfunction patchAISheet(source) {',
    'stage motion source-owned spacing helper',
)
stage = replace_once(
    stage,
    '  next = patchPreviewAISpacingPolishSource(next, id)\n',
    '  next = patchAISpacingPolishSource(next, id)\n',
    'stage motion local spacing call',
)
stage_path.write_text(stage)

# Strengthen the existing behavior test so the removed nested owner cannot return.
spacing_test_path = Path('tests/preview-ai-spacing-polish.test.js')
spacing_test = spacing_test_path.read_text()
spacing_test += """

test('AI spacing polish is owned inside stage motion without a nested build patch file', () => {
  const stage = fs.readFileSync(new URL('../src/preview-ai-stage-motion-patch.js', import.meta.url), 'utf8')
  assert.equal(fs.existsSync(new URL('../src/preview-ai-spacing-polish-patch.js', import.meta.url)), false)
  assert.doesNotMatch(stage, /preview-ai-spacing-polish-patch\\.js/)
  assert.match(stage, /const AI_SPACING_POLISH_CSS = `/)
  assert.match(stage, /function patchAISpacingPolishSource\\(source, id = ''\\)/)
  assert.match(stage, /next = patchAISpacingPolishSource\\(next, id\\)/)
})
"""
spacing_test_path.write_text(spacing_test)

# Keep a repository-level architecture guard for the retired nested owner.
final_path = Path('tests/final-runtime-owner.test.js')
final = final_path.read_text()
final = replace_once(
    final,
    "  assert.equal(exists('src/preview-ai-density-patch.js'), false)\n",
    "  assert.equal(exists('src/preview-ai-density-patch.js'), false)\n  assert.equal(exists('src/preview-ai-spacing-polish-patch.js'), false)\n",
    'final retired AI spacing owner absence',
)
final_path.write_text(final)
