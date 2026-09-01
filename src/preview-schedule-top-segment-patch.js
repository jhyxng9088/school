const SCHEDULE_TOP_SEGMENT_CSS = `
/* Preview-only schedule segmented control. Reuse the exact class top-segment material and motion. */
.schedule-top-segment {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}
`

const SCHEDULE_SEGMENT_COMPONENT = String.raw`
/* Preview-only schedule segment: intentionally reuses useClassTopSegmentSpring. */
function ScheduleTopSegment({ section, onSectionChange }) {
  const activeIndex = section === 'academic' ? 1 : section === 'meal' ? 2 : 0
  const spring = useClassTopSegmentSpring(activeIndex)
  const touchIntentRef = useRef({ key: '', at: 0 })
  const items = [
    { id: 'todo', label: '리마인더' },
    { id: 'academic', label: '학사일정' },
    { id: 'meal', label: '급식' },
  ]

  function selectSection(nextSection, pointerType = '') {
    if (nextSection === section) return
    if (pointerType && pointerType !== 'mouse') {
      touchIntentRef.current = { key: nextSection, at: performance.now() }
    }
    onSectionChange(nextSection)
  }

  return (
    <div ref={spring.containerRef} className="class-top-segment schedule-top-segment" role="group" aria-label="일정 세부 메뉴">
      <span ref={spring.indicatorRef} className="class-top-segment-pill" aria-hidden="true" />
      {items.map((item, index) => (
        <button
          ref={(node) => { spring.buttonRefs.current[index] = node }}
          key={item.id}
          type="button"
          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}
          aria-pressed={section === item.id}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            selectSection(item.id, event.pointerType)
          }}
          onClick={() => {
            const intent = touchIntentRef.current
            if (intent.key === item.id && performance.now() - intent.at < 700) {
              touchIntentRef.current = { key: '', at: 0 }
              return
            }
            selectSection(item.id)
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function ScheduleStationPage({ section, onSectionChange, todoPage, academicPage, mealPage }) {
  return (
    <section className="station-schedule-page">
      <ScheduleTopSegment section={section} onSectionChange={onSectionChange} />
      <div className="station-schedule-content">
        {section === 'academic' ? academicPage : section === 'meal' ? mealPage : todoPage}
      </div>
    </section>
  )
}
`

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview schedule top segment range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

export function patchPreviewScheduleTopSegmentSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/styles.css')) {
    if (current.includes('Preview-only schedule segmented control.')) return current
    return `${current}\n${SCHEDULE_TOP_SEGMENT_CSS}`
  }

  if (!cleanId.endsWith('/main.jsx')) return current
  if (current.includes('Preview-only schedule segment: intentionally reuses useClassTopSegmentSpring.')) return current
  if (!current.includes('function useClassTopSegmentSpring(activeIndex) {')) {
    throw new Error('Preview schedule top segment requires the class top segment spring first')
  }

  return spliceRequired(
    current,
    'function ScheduleStationPage({ section, onSectionChange, todoPage, academicPage, mealPage }) {',
    'function useClassTopSegmentSpring(activeIndex) {',
    `${SCHEDULE_SEGMENT_COMPONENT}\n`,
    'schedule station component',
  )
}
