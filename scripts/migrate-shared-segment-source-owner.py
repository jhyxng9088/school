from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


class_path = Path('src/preview-class-top-segment-patch.js')
class_source = class_path.read_text()
func_start = class_source.index(
    'function useClassTopSegmentSpring(activeIndex) {',
    class_source.index('const CLASS_SEGMENT_COMPONENT'),
)
func_end = class_source.index(
    '\nfunction ClassTopSegment({ section, onSectionChange }) {',
    func_start,
)
class_wrapper = '''function useClassTopSegmentSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--segment-padding',
    shellScaleProperty: '--segment-shell-scale-x',
    shellShiftProperty: '--segment-shell-shift-x',
    fallbackPadding: 5,
  })
}
'''
class_source = class_source[:func_start] + class_wrapper + class_source[func_end:]
class_source = replace_once(
    class_source,
    '''          key={item.id}
          type="button"
          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}''',
    '''          key={item.id}
          type="button"
          data-unread-key={item.id}
          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}''',
    'class unread key',
)
patch_main_marker = "function patchMainSource(source) {\n  let next = String(source || '')\n"
patch_main_replacement = patch_main_marker + '''
  if (!next.includes("from './s-hub-segment-spring.js'")) {
    next = replaceRequired(
      next,
      "import { SHubIcon } from './s-hub-icon.jsx'\\n",
      "import { SHubIcon } from './s-hub-icon.jsx'\\nimport { useSHubSegmentSpring } from './s-hub-segment-spring.js'\\n",
      'shared segment spring import',
    )
  }
'''
class_source = replace_once(
    class_source,
    patch_main_marker,
    patch_main_replacement,
    'class shared spring import',
)
class_path.write_text(class_source)


study_path = Path('src/preview-study-patch.js')
study = study_path.read_text()
study = replace_once(
    study,
    "import { PREVIEW_CLASS_SEGMENT_PHYSICS } from './preview-class-top-segment-patch.js'\n\n",
    '',
    'study duplicated physics import',
)
runtime_start = study.index('const STUDY_RANKING_SPRING_RUNTIME = String.raw`')
runtime_end = study.index('const STUDY_RANKING_SPRING_CSS = String.raw`', runtime_start)
study_runtime = '''const STUDY_RANKING_SPRING_RUNTIME = String.raw`
function useStudyRankingScopeSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--study-ranking-padding',
    shellScaleProperty: '--study-ranking-shell-scale-x',
    shellShiftProperty: '--study-ranking-shell-shift-x',
    fallbackPadding: 4,
  })
}

`

'''
study = study[:runtime_start] + study_runtime + study[runtime_end:]
old_import_patch = '''  next = replaceRequired(
    next,
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
    "import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'",
    'study ranking layout effect import',
  )
'''
new_import_patch = '''  if (!next.includes("from './s-hub-segment-spring.js'")) {
    next = replaceRequired(
      next,
      "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
      "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'\\nimport { useSHubSegmentSpring } from './s-hub-segment-spring.js'",
      'study ranking shared spring import',
    )
  }
'''
study = replace_once(
    study,
    old_import_patch,
    new_import_patch,
    'study shared spring import',
)
study_path.write_text(study)


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
    'vite shared segment exclusion',
)
vite_path.write_text(vite)


test_path = Path('tests/shared-segment-spring-owner.test.js')
test_path.write_text('''import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PREVIEW_CLASS_SEGMENT_PHYSICS } from '../src/preview-class-top-segment-patch.js'
import { S_HUB_SEGMENT_SPRING_PHYSICS } from '../src/s-hub-segment-spring.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared segment spring preserves the existing class physics values', () => {
  assert.deepEqual(S_HUB_SEGMENT_SPRING_PHYSICS, PREVIEW_CLASS_SEGMENT_PHYSICS)
})

test('class segment generator directly emits the shared spring wrapper and unread key', () => {
  const source = read('src/preview-class-top-segment-patch.js')
  assert.match(source, /useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(source, /paddingProperty: '--segment-padding'/)
  assert.match(source, /fallbackPadding: 5/)
  assert.match(source, /data-unread-key=\{item\.id\}/)
  assert.match(source, /import \{ useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.doesNotMatch(source, /physicsRef = useRef/)
})

test('study ranking generator directly emits the same shared spring wrapper', () => {
  const source = read('src/preview-study-patch.js')
  assert.match(source, /useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(source, /paddingProperty: '--study-ranking-padding'/)
  assert.match(source, /fallbackPadding: 4/)
  assert.match(source, /useSHubSegmentSpring \} from '\.\/s-hub-segment-spring\.js'/)
  assert.doesNotMatch(source, /PREVIEW_CLASS_SEGMENT_PHYSICS/)
  assert.doesNotMatch(source, /physicsRef = useRef/)
})

test('schedule continues to reuse the class segment spring wrapper', () => {
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(schedulePatch, /function useScheduleTopSegmentSpring/)
})

test('the retired final shared segment owner is absent from the Vite chain', () => {
  const vite = read('vite.config.js')
  assert.doesNotMatch(vite, /patchSharedSegmentSpringOwnerSource/)
  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-segment-spring-owner-patch.js', import.meta.url)), false)
})
''')
