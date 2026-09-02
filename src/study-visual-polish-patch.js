function countOccurrences(source, marker) {
  return marker ? String(source || '').split(marker).length - 1 : 0
}

function replaceExact(source, marker, replacement, label) {
  const count = countOccurrences(source, marker)
  if (count !== 1) {
    throw new Error(`Study visual polish patch drift: expected 1 occurrence, found ${count}: ${label}`)
  }
  return String(source || '').replace(marker, replacement)
}

function appendOnce(source, marker, addition) {
  const current = String(source || '')
  if (current.includes(marker)) return current
  return `${current}\n${addition}\n`
}

function patchStudyNavIcon(source) {
  const before = `  if (type === 'study') {
    return <svg {...common}><path d="M4.2 5.1h5.5a3.2 3.2 0 0 1 2.3.95v13a3.2 3.2 0 0 0-2.3-.95H4.2z"/><path d="M19.8 5.1h-5.5a3.2 3.2 0 0 0-2.3.95v13a3.2 3.2 0 0 1 2.3-.95h5.5z"/></svg>
  }`

  const after = `  if (type === 'study') {
    return <svg {...common}><path d="M3.3 5.8c3.1-.7 6 .2 8.7 2.4v10.9c-2.7-2.2-5.6-3.1-8.7-2.4V5.8Z"/><path d="M20.7 5.8c-3.1-.7-6 .2-8.7 2.4v10.9c2.7-2.2 5.6-3.1 8.7-2.4V5.8Z"/><path d="M12 8.2v10.9"/></svg>
  }`

  return replaceExact(source, before, after, 'study open-book navigation icon')
}

function patchStudyHeader(source) {
  return replaceExact(
    source,
    '<p className="eyebrow">S-Hub V2</p>',
    '<p className="eyebrow">공부 기록</p>',
    'study eyebrow copy',
  )
}

function patchBoardCopyWrapping(source) {
  return appendOnce(
    source,
    'S-Hub readable board header copy',
    `/* S-Hub readable board header copy: keep Korean words intact when wrapping. */
.preview-board-header-note {
  word-break: keep-all;
  overflow-wrap: break-word;
}`,
  )
}

function patchAICopyWrapping(source) {
  return appendOnce(
    source,
    'S-Hub readable AI hero copy',
    `/* S-Hub readable AI hero copy: wrap at word boundaries instead of splitting syllables. */
.s-hub-ai-page-title p:last-child {
  word-break: keep-all;
  overflow-wrap: break-word;
}`,
  )
}

export function patchStudyVisualPolishSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/main.jsx')) return patchStudyNavIcon(source)
  if (cleanId.endsWith('/src/preview-study.jsx')) return patchStudyHeader(source)
  if (cleanId.endsWith('/src/preview-board.css')) return patchBoardCopyWrapping(source)
  if (cleanId.endsWith('/src/s-hub-ai.css')) return patchAICopyWrapping(source)
  return String(source || '')
}
