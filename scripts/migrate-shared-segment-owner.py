from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text, start_marker, end_marker, replacement, label, require_start_zero=False):
    start = text.find(start_marker)
    if require_start_zero and start != 0:
        raise SystemExit(f'{label}: start marker drifted to {start}')
    if start < 0:
        raise SystemExit(f'{label}: start marker missing')
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f'{label}: end marker missing')
    return text[:start] + replacement + text[end:]


class_path = Path('src/preview-class-top-segment-patch.js')
class_source = class_path.read_text()
class_source = replace_between(
    class_source,
    'export const PREVIEW_CLASS_SEGMENT_PHYSICS = Object.freeze({',
    'const CLASS_TOP_SEGMENT_CSS',
    "import { S_HUB_SEGMENT_SPRING_PHYSICS } from './s-hub-segment-spring.js'\n\nexport const PREVIEW_CLASS_SEGMENT_PHYSICS = S_HUB_SEGMENT_SPRING_PHYSICS\n\nconst CLASS_TOP_SEGMENT_CSS",
    'class physics ownership',
    require_start_zero=True,
)
class_source = replace_between(
    class_source,
    'function useClassTopSegmentSpring(activeIndex) {',
    'function ClassTopSegment({ section, onSectionChange }) {',
    """function useClassTopSegmentSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--segment-padding',
    shellScaleProperty: '--segment-shell-scale-x',
    shellShiftProperty: '--segment-shell-shift-x',
    fallbackPadding: 5,
  })
}

function ClassTopSegment({ section, onSectionChange }) {""",
    'class spring runtime',
)
class_source = replace_once(
    class_source,
    "          key={item.id}\n          type=\"button\"\n          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}",
    "          key={item.id}\n          type=\"button\"\n          data-unread-key={item.id}\n          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}",
    'class unread semantic key',
)
class_source = replace_once(
    class_source,
    "function patchMainSource(source) {\n  let next = String(source || '')\n\n",
    "function patchMainSource(source) {\n  let next = String(source || '')\n  const sharedSpringImport = \"import { useSHubSegmentSpring } from './s-hub-segment-spring.js'\\n\"\n  if (!next.includes(sharedSpringImport)) {\n    if (!next.startsWith('import React')) throw new Error('Preview class top segment marker missing: React import')\n    const lineEnd = next.indexOf('\\n')\n    if (lineEnd < 0) throw new Error('Preview class top segment marker missing: React import line')\n    next = `${next.slice(0, lineEnd + 1)}${sharedSpringImport}${next.slice(lineEnd + 1)}`\n  }\n\n",
    'class shared spring import ownership',
)
class_path.write_text(class_source)

study_path = Path('src/preview-study-patch.js')
study_source = study_path.read_text()
study_source = replace_once(
    study_source,
    "import { PREVIEW_CLASS_SEGMENT_PHYSICS } from './preview-class-top-segment-patch.js'\n\n",
    '',
    'study duplicate physics import',
)
study_source = replace_between(
    study_source,
    'const STUDY_RANKING_SPRING_RUNTIME = String.raw`\n',
    'const STUDY_RANKING_SPRING_CSS = String.raw`',
    """const STUDY_RANKING_SPRING_RUNTIME = String.raw`
function useStudyRankingScopeSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--study-ranking-padding',
    shellScaleProperty: '--study-ranking-shell-scale-x',
    shellShiftProperty: '--study-ranking-shell-shift-x',
    fallbackPadding: 4,
  })
}

`

const STUDY_RANKING_SPRING_CSS = String.raw`""",
    'study spring runtime',
)
study_source = replace_once(
    study_source,
    "  next = replaceRequired(\n    next,\n    \"import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'\",\n    \"import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'\",\n    'study ranking layout effect import',\n  )",
    "  next = replaceRequired(\n    next,\n    \"import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'\",\n    \"import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'\\nimport { useSHubSegmentSpring } from './s-hub-segment-spring.js'\",\n    'study ranking shared spring import',\n  )",
    'study shared spring import ownership',
)
study_path.write_text(study_source)

vite_path = Path('vite.config.js')
vite = vite_path.read_text()
vite = replace_once(vite, "import { patchSharedSegmentSpringOwnerSource } from './src/shared-segment-spring-owner-patch.js'\n", '', 'vite shared owner import')
vite = replace_once(vite, '  next = patchSharedSegmentSpringOwnerSource(next, cleanId)\n', '', 'vite shared owner call')
vite = replace_once(vite, "        || cleanId.endsWith('/shared-segment-spring-owner-patch.js')\n", '', 'vite shared owner exclusion')
vite_path.write_text(vite)

Path('tests/shared-segment-spring-owner.test.js').write_text("""import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'
import { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('preview segment generators share the canonical spring physics object', () => {
  assert.equal(PREVIEW_CLASS_SEGMENT_PHYSICS, S_HUB_SEGMENT_SPRING_PHYSICS)
})

test('class segment generator owns the shared spring wrapper and unread semantic key directly', () => {
  const source = read('src/preview-class-top-segment-patch.js')
  assert.match(source, /import \\{ S_HUB_SEGMENT_SPRING_PHYSICS \\} from '\\.\\/s-hub-segment-spring\\.js'/)
  assert.match(source, /return useSHubSegmentSpring\\(activeIndex, \\{/)
  assert.match(source, /paddingProperty: '--segment-padding'/)
  assert.match(source, /data-unread-key=\\{item\\.id\\}/)
  assert.doesNotMatch(source, /physics\\.velocity \\+= acceleration \\* dt/)
})

test('study generator emits the same shared spring wrapper without a duplicate physics runtime', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  assert.match(page, /import \\{ useSHubSegmentSpring \\} from '\\.\\/s-hub-segment-spring\\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\\(activeIndex\\) \\{\\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const springForce =/)
  assert.doesNotMatch(page, /physics\\.velocity \\+=/)
})

test('schedule continues to reuse the class segment spring wrapper', () => {
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\\(activeIndex\\)/)
  assert.doesNotMatch(schedulePatch, /function useScheduleTopSegmentSpring/)
})

test('late shared segment build owner is fully retired from Vite', () => {
  const vite = read('vite.config.js')
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
})
""")

class_test_path = Path('tests/preview-class-top-segment.test.js')
class_test = class_test_path.read_text()
start = class_test.find("test('top segment uses the same canonical spring law as the bottom nav'")
end = class_test.find("test('top segment is thin and spans the class content width'", start)
if start < 0 or end < 0:
    raise SystemExit('class spring test boundary missing')
class_test = class_test[:start] + """test('top segment emits the canonical shared spring wrapper directly', () => {
  assert.deepEqual(PREVIEW_CLASS_SEGMENT_PHYSICS, {
    stiffness: 56,
    damping: 10.5,
    mass: 1,
    maxDt: 0.032,
    stretchPerVelocity: 0.032,
    maxStretch: 18,
    compressionVelocity: 18000,
    maxCompression: 0.028,
    radiusShrinkPerStretch: 0.08,
    settleDistancePx: 0.06,
    settleVelocityPx: 0.06,
  })
  const source = buildFinalMain()
  assert.match(source, /import \\{ useSHubSegmentSpring \\} from '\\.\\/s-hub-segment-spring\\.js'/)
  assert.match(source, /function useClassTopSegmentSpring\\(activeIndex\\) \\{\\n  return useSHubSegmentSpring/)
  assert.match(source, /paddingProperty: '--segment-padding'/)
  assert.match(source, /data-unread-key=\\{item\\.id\\}/)
  assert.doesNotMatch(source, /physics\\.velocity \\+= acceleration \\* dt/)
})

""" + class_test[end:]
class_test_path.write_text(class_test)

study_test_path = Path('tests/preview-study-ranking-motion.test.js')
study_test = study_test_path.read_text()
study_test = replace_once(study_test, "import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'\n", '', 'study test physics import')
start = study_test.find("test('study ranking reuses the class top-segment spring constants and stretch law'")
end = study_test.find("test('study ranking scope uses one physical pill with direct click ownership'", start)
if start < 0 or end < 0:
    raise SystemExit('study spring test boundary missing')
study_test = study_test[:start] + """test('study ranking emits the canonical shared segment spring wrapper directly', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(page, /import \\{ useSHubSegmentSpring \\} from '\\.\\/s-hub-segment-spring\\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\\(activeIndex\\) \\{\\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /shellScaleProperty: '--study-ranking-shell-scale-x'/)
  assert.match(page, /shellShiftProperty: '--study-ranking-shell-shift-x'/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const springForce =/)
  assert.doesNotMatch(page, /physics\\.velocity \\+=/)
})

""" + study_test[end:]
study_test_path.write_text(study_test)

final_test_path = Path('tests/final-runtime-owner.test.js')
final_test = final_test_path.read_text()
final_test = replace_once(final_test, "test('retired runtime cleanup and shared icon build owners stay out of the patch chain', () => {", "test('retired runtime cleanup, icon, and segment spring build owners stay out of the patch chain', () => {", 'final test title')
final_test = replace_once(final_test, "  assert.equal(exists('src/shared-icon-owner-patch.js'), false)\n", "  assert.equal(exists('src/shared-icon-owner-patch.js'), false)\n  assert.equal(exists('src/shared-segment-spring-owner-patch.js'), false)\n", 'final test owner absence')
final_test = replace_once(final_test, "  assert.equal((vite.match(/patchSharedSegmentSpringOwnerSource\\(next, cleanId\\)/g) || []).length, 1)\n", "  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)\n  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\\.js/)\n", 'final test vite segment owner')
final_test_path.write_text(final_test)
