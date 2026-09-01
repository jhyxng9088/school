const SHARED_ACTIVE_PILL_CSS = `
/* V2 shared active-pill visual. The study ranking segment and bottom navigation
   must resolve to the same visible fill instead of maintaining lookalike values. */
:root {
  --s-hub-active-pill-surface: var(--surface);
  --s-hub-active-pill-edge: var(--border);
  --s-hub-active-pill-shadow: inset 0 0 0 0.5px var(--s-hub-active-pill-edge), 0 5px 18px rgba(0, 0, 0, .10);
  --nav-indicator-surface: var(--s-hub-active-pill-surface);
  --nav-indicator-edge: var(--s-hub-active-pill-edge);
  --nav-indicator-shadow: 0 5px 18px rgba(0, 0, 0, .10);
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Matches the visible Study pill in the bottom navigation reference. */
    --s-hub-active-pill-surface: #2f2f31;
  }
}

html.school-samsung {
  /* Samsung dark-mode surfaces are intentionally opaque in S-Hub. Keep both
     pill locations on that same platform-specific surface. */
  --s-hub-active-pill-surface: var(--surface);
}

.nav-indicator {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-indicator {
  background: transparent !important;
  box-shadow: none !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-indicator::after {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}

.class-top-segment-pill {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}
`

const STUDY_FINAL_CSS = `
/* Final V2 study UI alignment. This intentionally comes after the older study
   polish layer so the visible ranking pill is exactly the shared nav pill. */
.preview-study-ranking-pill,
html.school-samsung .preview-study-ranking-pill {
  background: var(--s-hub-active-pill-surface) !important;
  box-shadow: var(--s-hub-active-pill-shadow) !important;
}

body .unified-school-sheet.preview-study-record-sheet .preview-study-sheet-total {
  margin-top: 2px;
}

body .unified-school-sheet.preview-study-record-sheet .preview-study-sheet-subject-heading {
  margin-top: 22px;
}

body .unified-school-sheet.preview-study-record-sheet .preview-study-sheet-note {
  margin-bottom: 4px;
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview study unified UI marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview study unified UI range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const UNIFIED_STUDENT_SHEET = String.raw`function StudyStudentSheet({ student, meId, nowMs, onClose }) {
  const id = studentIdentity(student)
  const totalSeconds = studentTodaySeconds(student, nowMs)
  const subjects = studentSubjectTotals(student, nowMs)
  const knownSubjectSeconds = subjects.reduce((sum, item) => sum + item.totalSeconds, 0)
  const missingBreakdown = Math.max(0, totalSeconds - knownSubjectSeconds)
  const [sheetOpen, setSheetOpen] = useState(true)
  const closeTimerRef = useRef(0)

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  function requestClose() {
    if (!sheetOpen || closeTimerRef.current) return
    setSheetOpen(false)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = 0
      onClose()
    }, 340)
  }

  return (
    <UnifiedBottomSheet
      open={sheetOpen}
      onClose={requestClose}
      title={student.name + (id === meId ? ' · 본인' : '')}
      subtitle={classLabel(student.classId)}
      ariaLabel={student.name + ' 공부 기록'}
      className="preview-study-record-sheet"
    >
      <div className="preview-study-sheet-total">
        <span>오늘 총 공부</span>
        <strong>{formatStudyDuration(totalSeconds)}</strong>
      </div>

      {student.active ? (
        <div className="preview-study-sheet-live">
          <span className={\`preview-study-live-dot\${student.active.isPaused ? ' is-paused' : ''}\`} aria-hidden="true" />
          <span>{student.active.subject} · {student.active.isPaused ? '일시정지' : '공부 중'}</span>
        </div>
      ) : null}

      <div className="preview-study-sheet-subject-heading">
        <h3>과목별 공부 시간</h3>
        <span>{subjects.length}개 과목</span>
      </div>

      {subjects.length ? (
        <div className="preview-study-subject-breakdown">
          {subjects.map((item) => (
            <div key={item.subject}>
              <span>{item.subject}</span>
              <strong>{formatStudyDuration(item.totalSeconds)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-study-sheet-empty">아직 과목별 공부 기록이 없습니다.</div>
      )}

      {missingBreakdown > 2 ? (
        <p className="preview-study-sheet-note">
          업데이트 이전에 기록된 {formatStudyDuration(missingBreakdown)}은 과목별로 분리되지 않습니다.
        </p>
      ) : null}
    </UnifiedBottomSheet>
  )
}

`

function patchStudyPage(source) {
  let next = String(source || '')
  if (next.includes('className="preview-study-record-sheet"')) return next

  next = replaceRequired(
    next,
    "import './preview-study.css'",
    "import { UnifiedBottomSheet } from './unified-sheet.jsx'\nimport './preview-study.css'",
    'unified sheet import',
  )

  next = spliceRequired(
    next,
    'function StudyStudentSheet({ student, meId, nowMs, onClose }) {',
    'export function PreviewStudyPage({ requireOnline = () => true }) {',
    UNIFIED_STUDENT_SHEET,
    'student record sheet',
  )

  return next
}

export function patchPreviewStudyUnifiedUISource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  const current = String(source || '')

  if (cleanId.endsWith('/preview-study.jsx')) return patchStudyPage(current)

  if (cleanId.endsWith('/styles.css')) {
    if (current.includes('--s-hub-active-pill-surface')) return current
    return `${current}\n${SHARED_ACTIVE_PILL_CSS}`
  }

  if (cleanId.endsWith('/preview-study.css') || cleanId.endsWith('/preview-study-ranking.css')) {
    if (current.includes('Final V2 study UI alignment.')) return current
    return `${current}\n${STUDY_FINAL_CSS}`
  }

  return current
}
