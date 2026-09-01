import { patchPreviewBoardFinishSource } from './preview-board-finish-patch.js'
import { patchPreviewBoardCompleteSource } from './preview-board-complete-patch.js'

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

function patchBoardAttachmentViewer(source) {
  let next = String(source || '')
  if (next.includes("import { createPortal } from 'react-dom'") && next.includes('document.body')) return next

  next = replaceRequired(
    next,
    `import { useEffect, useMemo, useRef, useState } from 'react'`,
    `import { useEffect, useMemo, useRef, useState } from 'react'\nimport { createPortal } from 'react-dom'`,
    'board original viewer portal import',
  )
  next = replaceRequired(
    next,
    `  return (\n    <div className={\`reminder-original-viewer \${closing ? 'is-closing' : ''}\`.trim()} role="dialog" aria-modal="true" aria-label="원본 파일">`,
    `  if (typeof document === 'undefined') return null\n\n  return createPortal(\n    <div className={\`reminder-original-viewer \${closing ? 'is-closing' : ''}\`.trim()} role="dialog" aria-modal="true" aria-label="원본 파일">`,
    'board original viewer portal open',
  )
  next = replaceRequired(
    next,
    `      </div>\n    </div>\n  )\n}\n\nexport function BoardAttachmentPicker`,
    `      </div>\n    </div>,\n    document.body,\n  )\n}\n\nexport function BoardAttachmentPicker`,
    'board original viewer portal close',
  )
  return next
}

function patchCompletedBoardRealtime(source) {
  let next = String(source || '')
  if (next.includes('subscribePreviewBoardRealtime')) return next

  next = replaceRequired(
    next,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`,
    `import { useCallback, useEffect, useMemo, useState } from 'react'`,
    'complete board react imports',
  )
  next = replaceRequired(
    next,
    `import { recordClassActivity } from './class-activity.js'`,
    `import { broadcastPreviewBoardRealtime, subscribePreviewBoardRealtime } from './preview-board-realtime.js'`,
    'Supabase realtime import',
  )
  next = replaceRequired(
    next,
    `export function PreviewBoard({ profile = null, activitySignal = null }) {`,
    `export function PreviewBoard({ profile = null }) {`,
    'complete board props',
  )
  next = replaceRequired(
    next,
    `  const activityReadyRef = useRef(false)\n  const lastActivityAtRef = useRef(0)\n`,
    ``,
    'remove Firestore realtime refs',
  )

  const oldEffect = `  useEffect(() => {\n    const updatedAt = Number(activitySignal?.updatedAt || 0)\n    if (!activityReadyRef.current) {\n      activityReadyRef.current = true\n      lastActivityAtRef.current = updatedAt\n      return undefined\n    }\n    if (!updatedAt || updatedAt <= lastActivityAtRef.current) return undefined\n    lastActivityAtRef.current = updatedAt\n    if (activitySignal?.actorStudentKey && activitySignal.actorStudentKey === meKey) return undefined\n    if (!navigator.onLine) return undefined\n    const timer = window.setTimeout(() => {\n      invalidatePreviewBoardSection(activeSectionId)\n      refresh({ quiet: true, forceSections: String(activitySignal?.entityId || '').startsWith('section:') })\n    }, 160)\n    return () => window.clearTimeout(timer)\n  }, [activitySignal?.updatedAt, activitySignal?.actorStudentKey, activitySignal?.entityId, activeSectionId, meKey, refresh])\n\n  function announceMutation(entityId, action = 'edited') {\n    if (!profile || !entityId) return\n    recordClassActivity(profile, 'board', entityId, action).catch((activityError) => console.error('Board realtime signal failed:', activityError))\n  }`

  const realtimeEffect = `  useEffect(() => {\n    let disposed = false\n    let unsubscribe = () => {}\n    subscribePreviewBoardRealtime((event) => {\n      if (disposed || !navigator.onLine) return\n      const sectionHints = Array.isArray(event?.sectionIds) ? event.sectionIds.map((value) => String(value || '')) : []\n      if (sectionHints.length && !sectionHints.includes(activeSectionId) && event?.kind !== 'section') return\n      invalidatePreviewBoardSection(activeSectionId)\n      refresh({ quiet: true, forceSections: event?.kind === 'section' })\n    }).then((stop) => {\n      if (disposed) stop()\n      else unsubscribe = stop\n    }).catch((realtimeError) => {\n      console.warn('S-Hub board realtime subscription unavailable:', realtimeError)\n    })\n    return () => {\n      disposed = true\n      unsubscribe()\n    }\n  }, [activeSectionId, refresh])\n\n  function announceMutation(entityId, action = 'edited', sectionIds = [activeSectionId]) {\n    if (!entityId) return\n    const kind = String(entityId).startsWith('section:') ? 'section' : action === 'added' ? 'post' : 'board'\n    void broadcastPreviewBoardRealtime({ kind, sectionIds })\n  }`

  next = replaceRequired(next, oldEffect, realtimeEffect, 'replace Firestore board realtime')
  next = replaceRequired(
    next,
    `    announceMutation(post.id, 'added')`,
    `    announceMutation(post.id, 'added', [post.sectionId])`,
    'new post realtime section',
  )
  next = replaceRequired(
    next,
    `    announceMutation(updated.id, 'edited')`,
    `    announceMutation(updated.id, 'edited', [activeSectionId, updated.sectionId])`,
    'moved post realtime sections',
  )
  return next
}

const BOARD_PAGE_COMPONENT = String.raw`function PreviewBoardPage({ profile }) {
  return <PreviewBoard profile={profile} />
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
  if (cleanId.endsWith('/preview-board.jsx')) {
    return patchPreviewBoardCompleteSource(patchPreviewBoardFinishSource(source, id), id)
  }
  if (cleanId.endsWith('/preview-board-attachments.jsx')) return patchBoardAttachmentViewer(source)
  if (cleanId.endsWith('/preview-board-complete.jsx')) return patchCompletedBoardRealtime(source)
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
    BOARD_PAGE_COMPONENT,
    'placeholder board page',
  )

  next = replaceRequired(next, CLASS_STATION_PAGE_MARKER, CLASS_STATION_PAGE_WITH_MOTION, 'class station transition')
  next = replaceRequired(next, `<PreviewBoardPage />`, `<PreviewBoardPage profile={profile} />`, 'board page profile props')
  return next
}
