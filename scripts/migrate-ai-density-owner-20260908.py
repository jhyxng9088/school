from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# Fold the exact downstream density CSS and inline JSX into the existing AI page owner.
density_path = Path('src/preview-ai-density-patch.js')
density = density_path.read_text()
page_path = Path('src/preview-ai-page-patch.js')
page = page_path.read_text()

css_prefix = 'const AI_DENSITY_CSS = `'
css_start = density.index(css_prefix) + len(css_prefix)
css_end = density.index('`\n\nfunction patchAISheet', css_start)
density_css = density[css_start:css_end].rstrip()
if 'Preview-only useful density below the AI composer.' not in density_css:
    raise SystemExit('AI density CSS marker missing')

page_css_end = '`\n\nfunction replaceRequired'
page_css_index = page.index(page_css_end)
if 'Preview-only useful density below the AI composer.' in page[:page_css_index]:
    raise SystemExit('AI density CSS already source-owned by AI page')
page = page[:page_css_index] + '\n\n' + density_css + '\n' + page[page_css_index:]

replacement_prefix = '  const replacement = `'
replacement_start = density.index(replacement_prefix) + len(replacement_prefix)
replacement_end = density.index('`\n\n  return current.replace(marker, replacement)', replacement_start)
density_replacement = density[replacement_start:replacement_end]
expected_prefix = '        {content}\\n\\n'
expected_suffix = '\\n      </section>'
if not density_replacement.startswith(expected_prefix) or not density_replacement.endswith(expected_suffix):
    raise SystemExit('AI density inline replacement shape changed unexpectedly')
density_inline = density_replacement[len(expected_prefix):-len(expected_suffix)]

page = replace_once(
    page,
    '        {content}\\n      </section>',
    '        {content}\\n\\n' + density_inline + '\\n      </section>',
    'AI page inline density ownership',
)
page_path.write_text(page)

# Retire the direct Vite owner leg.
vite_path = Path('vite.config.js')
vite = vite_path.read_text()
vite = replace_once(vite, "import { patchPreviewAIDensitySource } from './src/preview-ai-density-patch.js'\n", '', 'vite AI density import')
vite = replace_once(vite, '  next = patchPreviewAIDensitySource(next, cleanId)\n', '', 'vite AI density call')
vite = replace_once(vite, "        || cleanId.endsWith('/preview-ai-density-patch.js')\n", '', 'vite AI density exclusion')
vite_path.write_text(vite)

# Keep the direct-effect inventory aligned with the remaining production patch graph.
build_effect_path = Path('tests/build-patch-effect.test.js')
build_effect = build_effect_path.read_text()
build_effect = replace_once(
    build_effect,
    "  ['patchPreviewAIDensitySource', 'preview-ai-density-patch.js'],\n",
    '',
    'build effect retired AI density owner',
)
build_effect_path.write_text(build_effect)

# Make the density behavior contract assert the upstream owner directly.
density_test_path = Path('tests/preview-ai-density.test.js')
density_test_path.write_text("""import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

function builtAISheet() {
  return patchPreviewAIPageSource(read('src/s-hub-ai-sheet.jsx'), '/workspace/src/s-hub-ai-sheet.jsx')
}

test('AI page owner directly adds useful quick questions below the real composer', () => {
  const source = builtAISheet()
  assert.match(source, /빠른 질문/)
  assert.match(source, /이번 주 제출/)
  assert.match(source, /내일 시간표/)
  assert.match(source, /다가오는 시험/)
  assert.match(source, /시간표 변경/)
  assert.match(source, /onClick=\\{\\(\\) => setInput\\('이번 주에 뭐 제출해야 돼\\?'\\)\\}/)
  assert.match(source, /onClick=\\{\\(\\) => setInput\\('내일 시간표 뭐야\\?'\\)\\}/)
})

test('AI page owner directly emits truthful context counts', () => {
  const source = builtAISheet()
  assert.match(source, /AI가 참고하는 정보/)
  assert.match(source, /context\\?\\.timetable\\?\\.length \\|\\| 0/)
  assert.match(source, /context\\?\\.reminders\\?\\.length \\|\\| 0/)
  assert.match(source, /context\\?\\.academic\\?\\.length \\|\\| 0/)
})

test('AI page owner directly owns density responsive CSS', () => {
  const css = patchPreviewAIPageSource(read('src/s-hub-ai.css'), '/workspace/src/s-hub-ai.css')
  assert.match(css, /\\.s-hub-ai-page-quick-grid \\{[\\s\\S]*grid-template-columns: repeat\\(4/)
  assert.match(css, /@media \\(max-width: 560px\\)[\\s\\S]*\\.s-hub-ai-page-quick-grid \\{[\\s\\S]*grid-template-columns: repeat\\(2/)
  assert.match(css, /\\.s-hub-ai-page-context \\{[\\s\\S]*grid-template-columns: repeat\\(3/)
})

test('downstream AI density build owner is retired', () => {
  const vite = read('vite.config.js')
  assert.equal(exists('src/preview-ai-density-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewAIDensitySource/)
  assert.doesNotMatch(vite, /preview-ai-density-patch\\.js/)
  assert.match(vite, /patchPreviewAIPageSource\\(next, cleanId\\)/)
})
""")

# Lock the retired owner at the repository architecture boundary.
final_path = Path('tests/final-runtime-owner.test.js')
final = final_path.read_text()
final = replace_once(
    final,
    "  assert.equal(exists('src/preview-class-top-segment-style-patch.js'), false)\n",
    "  assert.equal(exists('src/preview-class-top-segment-style-patch.js'), false)\n  assert.equal(exists('src/preview-ai-density-patch.js'), false)\n",
    'final retired AI density owner absence',
)
final = replace_once(
    final,
    "  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\\.js/)\n",
    "  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\\.js/)\n  assert.doesNotMatch(vite, /patchPreviewAIDensitySource/)\n  assert.doesNotMatch(vite, /preview-ai-density-patch\\.js/)\n",
    'final retired AI density Vite absence',
)
final_path.write_text(final)
