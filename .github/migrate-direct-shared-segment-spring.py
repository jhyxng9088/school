from pathlib import Path
import subprocess


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# Class top segment: generate the final shared wrapper directly.
class_path = Path('src/preview-class-top-segment-patch.js')
source = class_path.read_text()
physics_boundary = '\n\nconst CLASS_TOP_SEGMENT_CSS'
boundary = source.find(physics_boundary)
if boundary < 0 or not source.startswith('export const PREVIEW_CLASS_SEGMENT_PHYSICS'):
    raise SystemExit('class physics prelude boundary missing')
prelude = '''import { S_HUB_SEGMENT_SPRING_PHYSICS } from './s-hub-segment-spring.js'

export const PREVIEW_CLASS_SEGMENT_PHYSICS = S_HUB_SEGMENT_SPRING_PHYSICS
const SHARED_SEGMENT_SPRING_IMPORT = "import { useSHubSegmentSpring } from './s-hub-segment-spring.js'"

'''
source = prelude + source[boundary + 2:]

component_marker = 'const CLASS_SEGMENT_COMPONENT = String.raw`'
helper = r'''function ensureSharedSegmentSpringImport(source) {
  const current = String(source || '')
  if (current.includes(SHARED_SEGMENT_SPRING_IMPORT)) return current
  if (!current.startsWith('import React')) {
    throw new Error('Preview class top segment drift: React import must remain first')
  }
  const lineEnd = current.indexOf('\n')
  if (lineEnd < 0) throw new Error('Preview class top segment drift: React import line missing')
  return `${current.slice(0, lineEnd + 1)}${SHARED_SEGMENT_SPRING_IMPORT}\n${current.slice(lineEnd + 1)}`
}

'''
source = replace_once(source, component_marker, helper + component_marker, 'class shared import helper')

component_start = source.find(component_marker)
spring_start = source.find('function useClassTopSegmentSpring(activeIndex) {', component_start)
spring_end = source.find('\n\nfunction ClassTopSegment', spring_start)
if spring_start < 0 or spring_end < 0:
    raise SystemExit('class duplicated spring boundary missing')
class_wrapper = '''function useClassTopSegmentSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--segment-padding',
    shellScaleProperty: '--segment-shell-scale-x',
    shellShiftProperty: '--segment-shell-shift-x',
    fallbackPadding: 5,
  })
}'''
source = source[:spring_start] + class_wrapper + source[spring_end:]
source = replace_once(
    source,
    '''          key={item.id}
          type="button"
          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}''',
    '''          key={item.id}
          type="button"
          data-unread-key={item.id}
          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}''',
    'class semantic unread key',
)
source = replace_once(
    source,
    "function patchMainSource(source) {\n  let next = String(source || '')",
    "function patchMainSource(source) {\n  let next = ensureSharedSegmentSpringImport(source)",
    'class direct shared import',
)
class_path.write_text(source)

# Study ranking: generate the same short shared wrapper directly.
study_path = Path('src/preview-study-patch.js')
source = study_path.read_text()
source = replace_once(
    source,
    "import { PREVIEW_CLASS_SEGMENT_PHYSICS } from './preview-class-top-segment-patch.js'\n\n",
    '',
    'study duplicated physics import',
)
runtime_start = source.find('const STUDY_RANKING_SPRING_RUNTIME = String.raw`')
css_start = source.find('\n\nconst STUDY_RANKING_SPRING_CSS', runtime_start)
if runtime_start < 0 or css_start < 0:
    raise SystemExit('study duplicated spring boundary missing')
study_helper_and_runtime = r'''const SHARED_SEGMENT_SPRING_IMPORT = "import { useSHubSegmentSpring } from './s-hub-segment-spring.js'"

function ensureSharedSegmentSpringImport(source) {
  const current = String(source || '')
  if (current.includes(SHARED_SEGMENT_SPRING_IMPORT)) return current
  if (!current.startsWith('import React')) {
    throw new Error('Preview study patch drift: React import must remain first')
  }
  const lineEnd = current.indexOf('\n')
  if (lineEnd < 0) throw new Error('Preview study patch drift: React import line missing')
  return `${current.slice(0, lineEnd + 1)}${SHARED_SEGMENT_SPRING_IMPORT}\n${current.slice(lineEnd + 1)}`
}

const STUDY_RANKING_SPRING_RUNTIME = String.raw`
function useStudyRankingScopeSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--study-ranking-padding',
    shellScaleProperty: '--study-ranking-shell-scale-x',
    shellShiftProperty: '--study-ranking-shell-shift-x',
    fallbackPadding: 4,
  })
}

`'''
source = source[:runtime_start] + study_helper_and_runtime + source[css_start:]

layout_anchor = '''  next = replaceRequired(
    next,
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'",'''
layout_start = source.find(layout_anchor)
layout_end_marker = "    'study ranking layout effect import',\n  )\n\n"
layout_end = source.find(layout_end_marker, layout_start)
if layout_start < 0 or layout_end < 0:
    raise SystemExit('study layout-effect injection block missing')
layout_end += len(layout_end_marker)
source = source[:layout_start] + '  next = ensureSharedSegmentSpringImport(next)\n\n' + source[layout_end:]
study_path.write_text(source)

# Vite no longer needs a final shared-segment replacement pass.
vite_path = Path('vite.config.js')
vite = vite_path.read_text()
vite = replace_once(
    vite,
    "import { patchSharedSegmentSpringOwnerSource } from './src/shared-segment-spring-owner-patch.js'\n",
    '',
    'vite shared segment import',
)
vite = replace_once(
    vite,
    '  next = patchSharedSegmentSpringOwnerSource(next, cleanId)\n',
    '',
    'vite shared segment call',
)
vite = replace_once(
    vite,
    "        || cleanId.endsWith('/shared-segment-spring-owner-patch.js')\n",
    '',
    'vite shared segment polite exclusion',
)
vite_path.write_text(vite)

shared_test = r'''import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'
import { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared segment spring preserves the existing class physics values', () => {
  assert.deepEqual(S_HUB_SEGMENT_SPRING_PHYSICS, PREVIEW_CLASS_SEGMENT_PHYSICS)
})

test('class top segment patch generates the shared spring wrapper directly', () => {
  const patch = read('src/preview-class-top-segment-patch.js')
  assert.match(patch, /SHARED_SEGMENT_SPRING_IMPORT/)
  assert.match(patch, /return useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(patch, /paddingProperty: '--segment-padding'/)
  assert.match(patch, /data-unread-key=\{item\.id\}/)
  assert.doesNotMatch(patch, /const physicsRef = useRef/)
  assert.doesNotMatch(patch, /physics\.velocity \+= acceleration \* dt/)
})

test('study ranking patch generates the same shared spring wrapper directly', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\) \{\n  return useSHubSegmentSpring/)
  assert.match(page, /paddingProperty: '--study-ranking-padding'/)
  assert.match(page, /fallbackPadding: 4/)
  assert.doesNotMatch(page, /const physicsRef = useRef/)
  assert.doesNotMatch(page, /const springForce =/)
})

test('schedule continues to reuse the class segment spring wrapper', () => {
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(schedulePatch, /function useScheduleTopSegmentSpring/)
})

test('final shared segment replacement owner is retired from Vite', () => {
  const vite = read('vite.config.js')
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
})
'''
Path('tests/shared-segment-spring-owner.test.js').write_text(shared_test)

class_test_path = Path('tests/preview-class-top-segment.test.js')
test_source = class_test_path.read_text()
start = test_source.find("test('top segment uses the same canonical spring law as the bottom nav', () => {")
end = test_source.find("test('top segment is thin and spans the class content width', () => {", start)
if start < 0 or end < 0:
    raise SystemExit('class spring test boundary missing')
replacement = r'''test('top segment uses the same canonical spring owner as the bottom nav', () => {
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
  assert.match(source, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(source, /return useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(source, /data-unread-key=\{item\.id\}/)
  assert.doesNotMatch(source, /physics\.velocity \+= acceleration \* dt/)
  assert.doesNotMatch(source, /const physicsRef = useRef/)
})

'''
test_source = test_source[:start] + replacement + test_source[end:]
class_test_path.write_text(test_source)

study_test_path = Path('tests/preview-study-ranking-motion.test.js')
test_source = study_test_path.read_text()
test_source = replace_once(
    test_source,
    "import { patchPreviewStudySource } from '../src/preview-study-patch.js'\n",
    "import { patchPreviewStudySource } from '../src/preview-study-patch.js'\nimport { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'\n",
    'study motion shared physics import',
)
start = test_source.find("test('study ranking reuses the class top-segment spring constants and stretch law', () => {")
end = test_source.find("test('study ranking scope uses one physical pill with direct click ownership', () => {", start)
if start < 0 or end < 0:
    raise SystemExit('study spring test boundary missing')
replacement = r'''test('study ranking reuses the canonical shared segment spring owner', () => {
  const page = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.deepEqual(PREVIEW_CLASS_SEGMENT_PHYSICS, S_HUB_SEGMENT_SPRING_PHYSICS)
  assert.match(page, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.match(page, /function useStudyRankingScopeSpring\(activeIndex\)/)
  assert.match(page, /return useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(page, /--study-ranking-shell-scale-x/)
  assert.match(page, /--study-ranking-shell-shift-x/)
  assert.doesNotMatch(page, /const springForce =/)
  assert.doesNotMatch(page, /const physicsRef = useRef/)
})

'''
test_source = test_source[:start] + replacement + test_source[end:]
study_test_path.write_text(test_source)

icon_test_path = Path('tests/shared-icon-owner.test.js')
test_source = icon_test_path.read_text()
test_source = replace_once(
    test_source,
    "import { patchSharedSegmentSpringOwnerSource } from '../src/shared-segment-spring-owner-patch.js'\n",
    '',
    'shared icon stale segment import',
)
test_source = replace_once(
    test_source,
    '  source = patchSharedSegmentSpringOwnerSource(source, id)\n',
    '',
    'shared icon stale segment call',
)
start = test_source.find("test('Vite calls the shared segment spring owner directly after visual polish', () => {")
if start < 0:
    raise SystemExit('shared icon Vite test boundary missing')
replacement = r'''test('Vite no longer needs final icon or segment replacement owners', () => {
  const vite = read('vite.config.js')
  assert.match(vite, /patchStudyVisualPolishSource\(next, cleanId\)/)
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-icon-owner-patch.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
})
'''
test_source = test_source[:start] + replacement
icon_test_path.write_text(test_source)

final_test_path = Path('tests/final-runtime-owner.test.js')
test_source = final_test_path.read_text()
start = test_source.find("test('retired runtime cleanup and shared icon build owners stay out of the patch chain', () => {")
end = test_source.find("test('polite copy remains a build-time owner for static source and public JavaScript', () => {", start)
if start < 0 or end < 0:
    raise SystemExit('final runtime owner test boundary missing')
replacement = r'''test('retired runtime, icon, and final segment replacement owners stay out of the patch chain', () => {
  const main = read('src/main.jsx')
  const vite = read('vite.config.js')

  assert.equal(exists('src/final-runtime-owner-patch.js'), false)
  assert.equal(exists('src/shared-icon-owner-patch.js'), false)
  assert.equal(exists('src/shared-segment-spring-owner-patch.js'), false)
  assert.match(main, /import \{ SHubIcon \} from '\.\/s-hub-icon\.jsx'/)
  assert.match(main, /return <SHubIcon name=\{type\} size=\{size\} \/>/)
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\.js/)
  assert.doesNotMatch(vite, /patchFinalRuntimeOwnerSource/)
})

'''
test_source = test_source[:start] + replacement + test_source[end:]
final_test_path.write_text(test_source)

subprocess.run(['git', 'rm', 'src/shared-segment-spring-owner-patch.js'], check=True)
subprocess.run(['git', 'rm', '.github/workflows/migrate-direct-shared-segment-spring.yml'], check=True)
subprocess.run(['git', 'rm', '.github/migrate-direct-shared-segment-spring.py'], check=True)

expected = {
    '.github/workflows/migrate-direct-shared-segment-spring.yml',
    '.github/migrate-direct-shared-segment-spring.py',
    'src/preview-class-top-segment-patch.js',
    'src/preview-study-patch.js',
    'src/shared-segment-spring-owner-patch.js',
    'tests/final-runtime-owner.test.js',
    'tests/preview-class-top-segment.test.js',
    'tests/preview-study-ranking-motion.test.js',
    'tests/shared-icon-owner.test.js',
    'tests/shared-segment-spring-owner.test.js',
    'vite.config.js',
}
changed = set(subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], text=True).splitlines())
if changed != expected:
    raise SystemExit(f'unexpected migration paths: {sorted(changed)}')
