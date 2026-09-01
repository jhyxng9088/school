function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview board marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview board range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const BOARD_PAGE_COMPONENT = String.raw`function PreviewBoardPage() {
  return <PreviewBoard />
}

`

const CLASS_STATION_PAGE_MARKER = String.raw`function ClassStationPage({ section, onSectionChange, timetablePage, boardPage }) {
  return (
    <section className="class-station-page">
      <ClassTopSegment section={section} onSectionChange={onSectionChange} />
      <div className="class-station-content">
        {section === 'board' ? boardPage : timetablePage}
      </div>
    </section>
  )
}
`

const CLASS_STATION_PAGE_WITH_MOTION = String.raw`function ClassStationPage({ section, onSectionChange, timetablePage, boardPage }) {
  return (
    <section className="class-station-page">
      <ClassTopSegment section={section} onSectionChange={onSectionChange} />
      <div className="class-station-content">
        <div
          key={section}
          className={'class-station-panel ' + (section === 'board' ? 'is-board' : 'is-timetable')}
        >
          {section === 'board' ? boardPage : timetablePage}
        </div>
      </div>
    </section>
  )
}
`

export function patchPreviewBoardSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')
  const boardImport = `import { PreviewBoard } from './preview-board.jsx'`
  const boardThemeImport = `import './preview-board-theme.css'`
  if (!next.includes(boardImport)) {
    next = replaceRequired(
      next,
      `import { SHubAIOrb } from './s-hub-ai-orb.jsx'`,
      `import { SHubAIOrb } from './s-hub-ai-orb.jsx'\n${boardImport}\n${boardThemeImport}`,
      'board import',
    )
  }

  next = spliceRequired(
    next,
    `function PreviewBoardPage() {`,
    `function PreviewStudyPage() {`,
    `${BOARD_PAGE_COMPONENT}function PreviewStudyPage() {`,
    'placeholder board page',
  )

  next = replaceRequired(
    next,
    CLASS_STATION_PAGE_MARKER,
    CLASS_STATION_PAGE_WITH_MOTION,
    'class station transition',
  )

  return next
}
