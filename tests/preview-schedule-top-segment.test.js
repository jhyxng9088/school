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
  return activeIndex
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

test('vite applies schedule patch after the class segment structure and material patches', () => {
  const vite = read('vite.config.js')
  const classStructure = vite.indexOf('patchPreviewClassTopSegmentSource(next, cleanId)')
  const classStyle = vite.indexOf('patchPreviewClassTopSegmentStyleSource(next, cleanId)')
  const schedule = vite.indexOf('patchPreviewScheduleTopSegmentSource(next, cleanId)')
  assert.ok(classStructure >= 0)
  assert.ok(classStyle > classStructure)
  assert.ok(schedule > classStyle)
  assert.match(vite, /preview-schedule-top-segment-patch\.js/)
})
