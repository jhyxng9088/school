import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewScheduleTopSegmentSource } from '../src/preview-schedule-top-segment-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const MAIN_FIXTURE = `
function ScheduleStationPage({ section, onSectionChange, todoPage, academicPage, mealPage }) {
  return (
    <section className="station-schedule-page">
      <div className="station-schedule-switcher" aria-label="일정 세부 메뉴">
        <button type="button" className={section === 'todo' ? 'is-active' : ''} onClick={() => onSectionChange('todo')}>리마인더</button>
        <button type="button" className={section === 'academic' ? 'is-active' : ''} onClick={() => onSectionChange('academic')}>학사일정</button>
        <button type="button" className={section === 'meal' ? 'is-active' : ''} onClick={() => onSectionChange('meal')}>급식</button>
      </div>
      {section === 'academic' ? academicPage : section === 'meal' ? mealPage : todoPage}
    </section>
  )
}
function useClassTopSegmentSpring(activeIndex) {
  return { activeIndex }
}
`

test('schedule uses the exact class top segment spring with three equal destinations', () => {
  const source = patchPreviewScheduleTopSegmentSource(MAIN_FIXTURE, '/workspace/src/main.jsx')
  assert.match(source, /function ScheduleTopSegment\(\{ section, onSectionChange \}\)/)
  assert.match(source, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.match(source, /section === 'academic' \? 1 : section === 'meal' \? 2 : 0/)
  assert.match(source, /\{ id: 'todo', label: '리마인더' \}/)
  assert.match(source, /\{ id: 'academic', label: '학사일정' \}/)
  assert.match(source, /\{ id: 'meal', label: '급식' \}/)
  assert.match(source, /className="class-top-segment schedule-top-segment"/)
  assert.doesNotMatch(source, /className="station-schedule-switcher"/)
})

test('schedule keeps the existing default content routing', () => {
  const source = patchPreviewScheduleTopSegmentSource(MAIN_FIXTURE, '/workspace/src/main.jsx')
  assert.match(source, /section === 'academic' \? academicPage : section === 'meal' \? mealPage : todoPage/)
})

test('schedule segment is three columns while inheriting class segment material and height', () => {
  const styles = patchPreviewScheduleTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(styles, /\.schedule-top-segment \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/)
  assert.doesNotMatch(styles, /height:/)
  assert.doesNotMatch(styles, /background:/)
})

test('vite applies schedule patch after the source-owned class segment structure and material', () => {
  const vite = read('vite.config.js')
  const classOwner = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const schedule = vite.indexOf('patchPreviewScheduleTopSegmentSource(next, cleanId)')
  assert.ok(classOwner >= 0)
  assert.ok(schedule > classOwner)
  assert.doesNotMatch(vite, /patchPreviewClassTopSegmentStyleSource/)
  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\.js/)
  assert.match(vite, /preview-schedule-top-segment-patch\.js/)
})


test('schedule spring keeps the outer shell physically coupled to the moving pill', () => {
  const classSegment = read('src/preview-class-top-segment-patch.js')
  const start = classSegment.indexOf('function useClassTopSegmentSpring(activeIndex) {')
  const end = classSegment.indexOf('function ClassTopSegment', start)
  const helper = classSegment.slice(start, end)
  assert.match(helper, /useSHubSegmentSpring\(activeIndex/)
  assert.match(helper, /deform: true/)
  assert.match(helper, /shellElastic: true/)
  assert.match(helper, /shellScaleProperty: '--segment-shell-scale-x'/)
  assert.match(helper, /shellShiftProperty: '--segment-shell-shift-x'/)
})


test('class and schedule both consume the same helper without duplicate spring config', () => {
  const classSegment = read('src/preview-class-top-segment-patch.js')
  const classStart = classSegment.indexOf('function ClassTopSegment')
  const classEnd = classSegment.indexOf('function ClassStationPage', classStart)
  const classComponent = classSegment.slice(classStart, classEnd)
  const schedulePatch = read('src/preview-schedule-top-segment-patch.js')
  assert.match(classComponent, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.match(schedulePatch, /const spring = useClassTopSegmentSpring\(activeIndex\)/)
  assert.doesNotMatch(classComponent, /useSHubSegmentSpring|deform:|shellElastic:/)
})
