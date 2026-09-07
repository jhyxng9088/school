from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


parent_path = Path('src/preview-class-top-segment-patch.js')
parent = parent_path.read_text()

parent = replace_once(
    parent,
    "  height: 46px;\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  margin: 2px 0 18px;",
    "  height: 44px !important;\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  margin: 2px auto 18px !important;",
    'class segment final shell geometry',
)
parent = replace_once(
    parent,
    "  border-radius: 14px;\n  background: var(--surface);\n  box-shadow: inset 0 0 0 0.5px var(--border);\n  pointer-events: none;",
    "  border-radius: 14px;\n  background: var(--nav-indicator-surface) !important;\n  opacity: 1 !important;\n  box-shadow:\n    inset 0 1px 0 var(--specular-edge),\n    inset 0 0 0 0.75px var(--nav-indicator-edge),\n    var(--nav-indicator-shadow) !important;\n  pointer-events: none;",
    'class segment final indicator material',
)
parent = replace_once(
    parent,
    "  min-height: 36px;\n  display: grid;",
    "  min-height: 34px !important;\n  display: grid;",
    'class segment final button geometry',
)
parent = replace_once(
    parent,
    "@media (min-width: 700px) {\n  .class-top-segment {",
    ".current-class-copy > p:last-child {\n  max-width: 440px !important;\n  word-break: keep-all;\n  overflow-wrap: break-word;\n}\n\n@media (min-width: 700px) {\n  .class-top-segment {",
    'current class copy width ownership',
)
parent = replace_once(
    parent,
    "function ClassTopSegment({ section, onSectionChange }) {\n  const activeIndex = section === 'board' ? 1 : 0\n  const spring = useClassTopSegmentSpring(activeIndex)\n  const touchIntentRef = useRef({ key: '', at: 0 })\n  const items = [\n    { id: 'timetable', label: '시간표' },\n    { id: 'board', label: '게시판' },\n  ]",
    "function ClassTopSegment({ section, onSectionChange }) {\n  const activeIndex = section === 'timetable' ? 1 : 0\n  const spring = useClassTopSegmentSpring(activeIndex)\n  const touchIntentRef = useRef({ key: '', at: 0 })\n  const items = [\n    { id: 'board', label: '게시판' },\n    { id: 'timetable', label: '시간표' },\n  ]",
    'board-first segment ownership',
)
parent = replace_once(
    parent,
    "function patchMainSource(source) {\n  let next = String(source || '')\n  const sharedSpringImport",
    "function patchMainSource(source) {\n  let next = String(source || '')\n  next = replaceRequired(\n    next,\n    `  const [classSection, setClassSection] = useState('timetable')`,\n    `  const [classSection, setClassSection] = useState('board')`,\n    'class default section',\n  )\n  const sharedSpringImport",
    'class default ownership',
)
parent_path.write_text(parent)

vite_path = Path('vite.config.js')
vite = vite_path.read_text()
vite = replace_once(vite, "import { patchPreviewClassTopSegmentStyleSource } from './src/preview-class-top-segment-style-patch.js'\n", '', 'vite style owner import')
vite = replace_once(vite, '  next = patchPreviewClassTopSegmentStyleSource(next, cleanId)\n', '', 'vite style owner call')
vite = replace_once(vite, "        || cleanId.endsWith('/preview-class-top-segment-style-patch.js')\n", '', 'vite style owner exclusion')
vite_path.write_text(vite)

build_effect_path = Path('tests/build-patch-effect.test.js')
build_effect = build_effect_path.read_text()
build_effect = replace_once(
    build_effect,
    "  ['patchPreviewClassTopSegmentStyleSource', 'preview-class-top-segment-style-patch.js'],\n",
    '',
    'build effect retired class style owner',
)
build_effect_path.write_text(build_effect)

style_test_path = Path('tests/preview-class-top-segment-style.test.js')
style_test_path.write_text("""import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewClassTopSegmentSource } from '../src/preview-class-top-segment-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

test('class top segment parent owns the final centered thin geometry', () => {
  const source = patchPreviewClassTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(source, /height: 44px !important/)
  assert.match(source, /margin: 2px auto 18px !important/)
  assert.match(source, /min-height: 34px !important/)
})

test('class top segment parent owns the exact bottom nav indicator material tokens', () => {
  const source = patchPreviewClassTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(source, /\\.class-top-segment-pill \\{[\\s\\S]*background: var\\(--nav-indicator-surface\\) !important/)
  assert.match(source, /opacity: 1 !important/)
  assert.match(source, /inset 0 1px 0 var\\(--specular-edge\\)/)
  assert.match(source, /inset 0 0 0 0\\.75px var\\(--nav-indicator-edge\\)/)
  assert.match(source, /var\\(--nav-indicator-shadow\\) !important/)
})

test('class segment parent keeps the home current-class description readable', () => {
  const source = patchPreviewClassTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(source, /\\.current-class-copy > p:last-child \\{[\\s\\S]*max-width: 440px !important/)
  assert.match(source, /word-break: keep-all/)
  assert.match(source, /overflow-wrap: break-word/)
})

test('class segment parent owns board-first order and board default directly', () => {
  const source = read('src/preview-class-top-segment-patch.js')
  assert.match(source, /const activeIndex = section === 'timetable' \\? 1 : 0/)
  assert.ok(source.indexOf("{ id: 'board', label: '게시판' }") < source.indexOf("{ id: 'timetable', label: '시간표' }"))
  assert.match(source, /setClassSection\\] = useState\\('timetable'\\)[\\s\\S]*setClassSection\\] = useState\\('board'\\)/)
})

test('downstream class segment style build owner is retired', () => {
  const vite = read('vite.config.js')
  assert.equal(exists('src/preview-class-top-segment-style-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewClassTopSegmentStyleSource/)
  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\\.js/)
  assert.match(vite, /patchPreviewClassTopSegmentSource\\(next, cleanId\\)/)
})
""")

final_path = Path('tests/final-runtime-owner.test.js')
final = final_path.read_text()
final = replace_once(
    final,
    "test('retired runtime cleanup, icon, and segment spring build owners stay out of the patch chain', () => {",
    "test('retired runtime cleanup, icon, segment spring, and class style build owners stay out of the patch chain', () => {",
    'final owner title',
)
final = replace_once(
    final,
    "  assert.equal(exists('src/shared-segment-spring-owner-patch.js'), false)\n",
    "  assert.equal(exists('src/shared-segment-spring-owner-patch.js'), false)\n  assert.equal(exists('src/preview-class-top-segment-style-patch.js'), false)\n",
    'final retired style owner absence',
)
final = replace_once(
    final,
    "  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\\.js/)\n",
    "  assert.doesNotMatch(vite, /shared-segment-spring-owner-patch\\.js/)\n  assert.doesNotMatch(vite, /patchPreviewClassTopSegmentStyleSource/)\n  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\\.js/)\n",
    'final retired style Vite absence',
)
final_path.write_text(final)

board_test_path = Path('tests/preview-board.test.js')
board_test = board_test_path.read_text()
board_test = replace_once(
    board_test,
    "import { patchPreviewClassTopSegmentStyleSource } from '../src/preview-class-top-segment-style-patch.js'\n",
    '',
    'board test retired style import',
)
board_test = replace_once(
    board_test,
    "  source = patchPreviewClassTopSegmentStyleSource(source, id)\n",
    '',
    'board test retired style invocation',
)
board_test_path.write_text(board_test)

class_test_path = Path('tests/preview-class-top-segment.test.js')
class_test = class_test_path.read_text()
class_test = replace_once(
    class_test,
    "  assert.match(styles, /\\.class-top-segment \\{[\\s\\S]*width: 100%;[\\s\\S]*height: 46px;/)\n",
    "  assert.match(styles, /\\.class-top-segment \\{[\\s\\S]*width: 100%;[\\s\\S]*height: 44px !important;/)\n  assert.match(styles, /margin: 2px auto 18px !important;/)\n",
    'class test final style geometry',
)
class_test_path.write_text(class_test)

schedule_test_path = Path('tests/preview-schedule-top-segment.test.js')
schedule_test = schedule_test_path.read_text()
old_schedule_test = """test('vite applies schedule patch after the class segment structure and material patches', () => {
  const vite = read('vite.config.js')
  const classStructure = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const classStyle = vite.indexOf('patchPreviewClassTopSegmentStyleSource(next, cleanId)')
  const schedule = vite.indexOf('patchPreviewScheduleTopSegmentSource(next, cleanId)')
  assert.ok(classStructure >= 0)
  assert.ok(classStyle > classStructure)
  assert.ok(schedule > classStyle)
  assert.match(vite, /preview-schedule-top-segment-patch\\.js/)
})"""
new_schedule_test = """test('vite applies schedule patch after the source-owned class segment structure and material', () => {
  const vite = read('vite.config.js')
  const classOwner = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const schedule = vite.indexOf('patchPreviewScheduleTopSegmentSource(next, cleanId)')
  assert.ok(classOwner >= 0)
  assert.ok(schedule > classOwner)
  assert.doesNotMatch(vite, /patchPreviewClassTopSegmentStyleSource/)
  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\\.js/)
  assert.match(vite, /preview-schedule-top-segment-patch\\.js/)
})"""
schedule_test = replace_once(schedule_test, old_schedule_test, new_schedule_test, 'schedule test retired class style owner')
schedule_test_path.write_text(schedule_test)
