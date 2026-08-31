const CLASS_TOP_SEGMENT_STYLE_CSS = `
/* Preview-only visual refinement for the top class segmented control. */
.class-top-segment {
  height: 44px !important;
  margin: 2px auto 18px !important;
}

.class-top-segment-pill {
  background: var(--nav-indicator-surface) !important;
  opacity: 1 !important;
  box-shadow:
    inset 0 1px 0 var(--specular-edge),
    inset 0 0 0 0.75px var(--nav-indicator-edge),
    var(--nav-indicator-shadow) !important;
}

.class-top-segment-button {
  min-height: 34px !important;
}
`

function patchClassDefaultAndOrder(source) {
  let next = String(source || '')

  const defaultMarker = `  const [classSection, setClassSection] = useState('timetable')`
  if (!next.includes(defaultMarker)) {
    throw new Error('Preview class segment default marker changed unexpectedly')
  }
  next = next.replace(
    defaultMarker,
    `  const [classSection, setClassSection] = useState('board')`,
  )

  const orderMarker = `function ClassTopSegment({ section, onSectionChange }) {\n  const activeIndex = section === 'board' ? 1 : 0\n  const spring = useClassTopSegmentSpring(activeIndex)\n  const touchIntentRef = useRef({ key: '', at: 0 })\n  const items = [\n    { id: 'timetable', label: '시간표' },\n    { id: 'board', label: '게시판' },\n  ]`
  if (!next.includes(orderMarker)) {
    throw new Error('Preview class segment order marker changed unexpectedly')
  }
  next = next.replace(
    orderMarker,
    `function ClassTopSegment({ section, onSectionChange }) {\n  const activeIndex = section === 'timetable' ? 1 : 0\n  const spring = useClassTopSegmentSpring(activeIndex)\n  const touchIntentRef = useRef({ key: '', at: 0 })\n  const items = [\n    { id: 'board', label: '게시판' },\n    { id: 'timetable', label: '시간표' },\n  ]`,
  )

  return next
}

export function patchPreviewClassTopSegmentStyleSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]

  if (cleanId.endsWith('/main.jsx')) {
    return patchClassDefaultAndOrder(source)
  }

  if (!cleanId.endsWith('/styles.css')) return String(source || '')
  const current = String(source || '')
  if (current.includes('Preview-only visual refinement for the top class segmented control.')) return current
  return `${current}\n${CLASS_TOP_SEGMENT_STYLE_CSS}`
}
