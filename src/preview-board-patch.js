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

function patchCompletedBoardRealtime(source) {
  let next = String(source || '')
  if (next.includes('subscribePreviewBoardRealtime')) return next

  next = replaceRequired(
    next,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`,
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

function patchCompletedBoardUnread(source) {
  let next = String(source || '')
  if (next.includes("usePreviewBoardUnread(profile)")) return next

  next = replaceRequired(
    next,
    `import { BoardAttachmentGallery, BoardAttachmentPicker } from './preview-board-attachments.jsx'`,
    `import { BoardAttachmentGallery, BoardAttachmentPicker } from './preview-board-attachments.jsx'\nimport { usePreviewBoardUnread } from './preview-board-unread.js'`,
    'board unread import',
  )
  next = replaceRequired(
    next,
    `export function PreviewBoard({ profile = null }) {`,
    `export function PreviewBoard({ profile = null }) {\n  const boardUnread = usePreviewBoardUnread(profile)`,
    'board unread hook',
  )
  next = replaceRequired(
    next,
    `  const activeSectionName = activeSection.label || '일반'`,
    `  const activeSectionName = activeSection.label || '일반'\n\n  useEffect(() => {\n    if (!detailPostId || !boardUnread.isPostUnread(detailPostId)) return\n    boardUnread.markPostRead(detailPostId)\n  }, [detailPostId, boardUnread.revision])`,
    'keep open board detail read',
  )
  next = replaceRequired(
    next,
    `                const attachments = Array.isArray(post.attachments) ? post.attachments : []\n                return (`,
    `                const attachments = Array.isArray(post.attachments) ? post.attachments : []\n                const unread = boardUnread.isPostUnread(post.id)\n                return (`,
    'board unread card state',
  )
  next = replaceRequired(
    next,
    `                  <button type="button" className="preview-board-card" key={post.id} style={{ '--board-delay': \`${'${Math.min(index, 8) * 28}'}ms\` }} onClick={() => setDetailPostId(post.id)}>`,
    `                  <button type="button" className={\`preview-board-card ${'${unread ? \'has-unread\' : \'\'}'}\`} key={post.id} style={{ '--board-delay': \`${'${Math.min(index, 8) * 28}'}ms\` }} onClick={() => { boardUnread.markPostRead(post.id); setDetailPostId(post.id) }}>`,
    'board unread card button',
  )
  next = replaceRequired(
    next,
    `                    <h2>{post.title}</h2>`,
    `                    <h2>{post.title}{unread ? <span className="preview-board-unread-dot" aria-label="새 업데이트" /> : null}</h2>`,
    'board unread card dot',
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

const CLASS_STATION_PAGE_WITH_MOTION = String.raw`function ClassStationPage({ section, onSectionChange, timetablePage, boardPage, hasBoardUnread = false }) {
  return (
    <section className="class-station-page">
      <ClassTopSegment section={section} onSectionChange={onSectionChange} hasBoardUnread={hasBoardUnread} />
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

function patchMainUnread(source) {
  let next = String(source || '')
  if (next.includes('const boardUnread = usePreviewBoardUnread(profile)')) return next

  next = replaceRequired(
    next,
    `function ClassTopSegment({ section, onSectionChange }) {`,
    `function ClassTopSegment({ section, onSectionChange, hasBoardUnread = false }) {`,
    'class segment unread prop',
  )
  next = replaceRequired(
    next,
    `          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}`,
    `          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '') + (item.id === 'board' && hasBoardUnread ? ' has-board-unread' : '')}`,
    'class segment unread class',
  )
  next = replaceRequired(
    next,
    `function AppShell({ profile }) {`,
    `function AppShell({ profile }) {\n  const boardUnread = usePreviewBoardUnread(profile)`,
    'app shell board unread hook',
  )
  next = replaceRequired(
    next,
    `        onSectionChange={setClassSection}\n        boardPage=`,
    `        onSectionChange={setClassSection}\n        hasBoardUnread={boardUnread.hasSectionUnread}\n        boardPage=`,
    'class page unread prop',
  )
  next = replaceRequired(
    next,
    "className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}",
    "className={`nav-button ${activeTab === tab.id ? 'active' : ''} ${tab.id === 'class' && boardUnread.hasSectionUnread ? 'has-board-unread' : ''}`}",
    'bottom nav unread class',
  )
  return next
}

export function patchPreviewBoardSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/preview-board.jsx')) {
    return patchPreviewBoardCompleteSource(patchPreviewBoardFinishSource(source, id), id)
  }
  if (cleanId.endsWith('/preview-board-complete.jsx')) return patchCompletedBoardUnread(patchCompletedBoardRealtime(source))
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')
  const boardImport = `import { PreviewBoard } from './preview-board.jsx'`
  const boardThemeImport = `import './preview-board-theme.css'`
  const boardUnreadImport = `import { usePreviewBoardUnread } from './preview-board-unread.js'`
  if (!next.includes(boardImport)) {
    next = replaceRequired(
      next,
      `import { SHubAIOrb } from './s-hub-ai-orb.jsx'`,
      `import { SHubAIOrb } from './s-hub-ai-orb.jsx'\n${boardImport}\n${boardThemeImport}\n${boardUnreadImport}`,
      'board import',
    )
  } else if (!next.includes(boardUnreadImport)) {
    next = replaceRequired(next, boardImport, `${boardImport}\n${boardUnreadImport}`, 'board unread import')
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
  next = patchMainUnread(next)
  return next
}
