from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


context_path = Path('src/preview-ai-context-layout-patch.js')
context = context_path.read_text()
stage_path = Path('src/preview-ai-stage-motion-patch.js')
stage = stage_path.read_text()

# Fold the exact UI layout behavior into the existing AI presentation owner,
# preserving the current execution order: stage motion -> spacing -> context layout.
css_prefix = 'const AI_CONTEXT_LAYOUT_CSS = `'
css_start = context.index(css_prefix) + len(css_prefix)
css_end = context.index('`\n\nfunction replaceRequired', css_start)
context_css = context[css_start:css_end]
if 'Preview AI context layout: reference tools first, composer last.' not in context_css:
    raise SystemExit('AI context layout CSS marker missing')

stage = replace_once(
    stage,
    "import { patchPreviewAIContextLayoutSource } from './preview-ai-context-layout-patch.js'\n\n",
    '',
    'stage context layout import',
)
stage = replace_once(
    stage,
    'const AI_STAGE_MOTION_CSS = `',
    f'const AI_CONTEXT_LAYOUT_CSS = `{context_css}`\n\nconst AI_STAGE_MOTION_CSS = `',
    'stage context layout CSS ownership',
)

sheet_start = context.index('function patchAISheet(source) {')
sheet_end = context.index('\n\nfunction patchMain(source)', sheet_start)
context_sheet = context[sheet_start:sheet_end].replace(
    'function patchAISheet(source) {',
    'function patchAIContextLayoutSheet(source) {',
    1,
)
stage = replace_once(
    stage,
    'function patchAISheet(source) {',
    f'{context_sheet}\n\nfunction patchAISheet(source) {{',
    'stage context layout sheet ownership',
)
stage = replace_once(
    stage,
    "  next = patchAISpacingPolishSource(next, id)\n  return patchPreviewAIContextLayoutSource(next, id)\n}",
    "  next = patchAISpacingPolishSource(next, id)\n  if (cleanId.endsWith('/s-hub-ai-sheet.jsx')) {\n    next = patchAIContextLayoutSheet(next)\n  } else if (cleanId.endsWith('/s-hub-ai.css')) {\n    if (!next.includes('Preview AI context layout: reference tools first, composer last.')) next = `${next}\\n${AI_CONTEXT_LAYOUT_CSS}`\n  }\n  return next\n}",
    'stage context layout execution',
)
stage_path.write_text(stage)

# Source-own the meal context input in main.jsx.
main_path = Path('src/main.jsx')
main = main_path.read_text()
main = replace_once(
    main,
    "      customAcademicEvents: academicData?.events || [],\n    })",
    "      customAcademicEvents: academicData?.events || [],\n      mealRanges: schoolData?.mealRanges || {},\n    })",
    'main AI context meal ranges',
)
main = replace_once(
    main,
    "  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, academicData?.events])",
    "  }, [now, weeklySchedule, overrides, todoData.todos, schoolData?.academicEvents, schoolData?.mealRanges, academicData?.events])",
    'main AI context meal dependency',
)
main_path.write_text(main)

# Source-own meal normalization/output in s-hub-ai-core.js using the exact helper
# previously emitted by the build patch. The helper lives inside a JS template
# literal, so decode only its explicit newline escapes before writing raw source.
core_path = Path('src/s-hub-ai-core.js')
core = core_path.read_text()
patch_core_start = context.index('function patchAICore(source) {')
helper_prefix = '  const helper = `'
helper_start = context.index(helper_prefix, patch_core_start) + len(helper_prefix)
helper_end = context.index('`\n\n  next = replaceRequired(', helper_start)
helper = context[helper_start:helper_end].replace('\\n', '\n')
if 'function normalizeContextMeals(mealRanges)' not in helper:
    raise SystemExit('AI context meal helper missing')
core = replace_once(
    core,
    'export function buildSchoolAIContext({\n',
    f'{helper}export function buildSchoolAIContext({{\n',
    'core meal normalizer insertion',
)
core = replace_once(
    core,
    "  customAcademicEvents = [],\n} = {}) {",
    "  customAcademicEvents = [],\n  mealRanges = {},\n} = {}) {",
    'core meal range argument',
)
core = replace_once(
    core,
    "\n  return {\n    reference:",
    "\n  const meals = normalizeContextMeals(mealRanges)\n\n  return {\n    reference:",
    'core meal calculation',
)
core = replace_once(
    core,
    "    timetable,\n    academic,\n  }",
    "    timetable,\n    academic,\n    meals,\n  }",
    'core meal output',
)
core_path.write_text(core)

# Source-own the transport dedupe guard while retaining the cache fallback for callers
# that do not yet carry meals in SCHOOL_DATA.
transport_path = Path('src/s-hub-ai-transport.js')
transport = transport_path.read_text()
transport = replace_once(
    transport,
    "  if (purpose === 'reminder') return prompt",
    "  // Preview: SCHOOL_DATA already carries meals; keep the cache path only as a legacy fallback.\n  if (purpose === 'reminder' || /\"meals\"\\s*:/.test(prompt)) return prompt",
    'transport meal prompt dedupe',
)
transport_path.write_text(transport)

# Rewrite the contract so it verifies the new real owners directly.
context_test_path = Path('tests/preview-ai-context-layout.test.js')
context_test_path.write_text("""import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildSchoolAIContext } from '../src/s-hub-ai-core.js'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewAIStageMotionSource } from '../src/preview-ai-stage-motion-patch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

test('AI presentation owner puts quick questions and context before the composer and shows meals', () => {
  const id = path.join(root, 'src/s-hub-ai-sheet.jsx')
  let source = read('src/s-hub-ai-sheet.jsx')
  source = patchPreviewAIPageSource(source, id)
  source = patchPreviewAIStageMotionSource(source, id)

  const quickIndex = source.indexOf('aria-label=\"빠른 질문\"')
  const infoIndex = source.indexOf('aria-label=\"AI가 참고하는 정보\"')
  const contentIndex = source.indexOf('        {content}', infoIndex)

  assert.ok(quickIndex >= 0)
  assert.ok(infoIndex > quickIndex)
  assert.ok(contentIndex > infoIndex)
  assert.match(source, /<strong>급식<\\/strong><span>\\{context\\?\\.meals\\?\\.length \\|\\| 0\\}개 확인 가능<\\/span>/)
})

test('AI core directly includes normalized meal data from live school state', () => {
  const context = buildSchoolAIContext({
    now: new Date(2026, 8, 1, 9, 30),
    mealRanges: {
      current: {
        meals: [
          { rawDate: '20260901', mealCode: '2', mealName: '중식', dishes: ['쌀밥', '미역국'], calories: '650 Kcal' },
        ],
      },
      duplicate: {
        meals: [
          { rawDate: '20260901', mealCode: '2', mealName: '중식', dishes: ['쌀밥', '미역국'], calories: '650 Kcal' },
          { rawDate: '20260902', mealCode: '2', mealName: '중식', dishes: ['비빔밥'] },
        ],
      },
    },
  })

  assert.deepEqual(context.meals, [
    { date: '2026-09-01', mealCode: '2', mealName: '중식', dishes: ['쌀밥', '미역국'], calories: '650 Kcal' },
    { date: '2026-09-02', mealCode: '2', mealName: '중식', dishes: ['비빔밥'], calories: '' },
  ])
})

test('main and transport directly own meal context wiring and duplicate-prompt avoidance', () => {
  const main = read('src/main.jsx')
  assert.match(main, /mealRanges: schoolData\\?\\.mealRanges \\|\\| \\{\\}/)
  assert.match(main, /schoolData\\?\\.mealRanges/)

  const transport = read('src/s-hub-ai-transport.js')
  assert.match(transport, /SCHOOL_DATA already carries meals/)
  assert.match(transport, /\"meals\"\\s\\*:/)
})

test('AI presentation owner keeps long composer content above the fixed bottom nav', () => {
  const id = path.join(root, 'src/s-hub-ai.css')
  let css = patchPreviewAIPageSource(read('src/s-hub-ai.css'), id)
  css = patchPreviewAIStageMotionSource(css, id)

  assert.match(css, /--s-hub-ai-top-inset:\\s*max\\(32px, env\\(safe-area-inset-top\\)\\)/)
  assert.match(css, /--s-hub-ai-nav-clearance:\\s*calc\\(64px \\+ var\\(--nav-bottom\\) \\+ 24px\\)/)
  assert.match(css, /min-height:\\s*calc\\(100dvh \\+ 24px - var\\(--s-hub-ai-top-inset\\)\\)/)
  assert.match(css, /padding-bottom:\\s*var\\(--s-hub-ai-nav-clearance\\)/)
  assert.match(css, /\\.s-hub-ai-page \\.s-hub-ai-content\\s*\\{[^}]*scroll-margin-bottom:\\s*var\\(--s-hub-ai-nav-clearance\\)/s)
  assert.match(css, /@media \\(max-height: 760px\\)[\\s\\S]*padding-bottom:\\s*calc\\(104px \\+ env\\(safe-area-inset-bottom\\)\\)/)
})

test('nested AI context layout build owner is retired', () => {
  const stage = read('src/preview-ai-stage-motion-patch.js')
  assert.equal(exists('src/preview-ai-context-layout-patch.js'), false)
  assert.doesNotMatch(stage, /patchPreviewAIContextLayoutSource/)
  assert.doesNotMatch(stage, /preview-ai-context-layout-patch\\.js/)
  assert.match(stage, /function patchAIContextLayoutSheet\\(source\\)/)
})
""")

# Add a repository-level guard against the nested owner returning.
final_path = Path('tests/final-runtime-owner.test.js')
final = final_path.read_text()
final = replace_once(
    final,
    "  assert.equal(exists('src/preview-ai-spacing-polish-patch.js'), false)\n",
    "  assert.equal(exists('src/preview-ai-spacing-polish-patch.js'), false)\n  assert.equal(exists('src/preview-ai-context-layout-patch.js'), false)\n",
    'final retired AI context layout owner absence',
)
final_path.write_text(final)
