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
    return <svg {...common}><circle cx="12" cy="13" r="7.2"/><path d="M12 9.3v4l2.6 1.6"/><path d="M9.4 3.5h5.2"/><path d="M12 3.5v2.3"/><path d="m17.4 7.5 1.5-1.5"/></svg>
  }`

  return replaceExact(source, before, after, 'study stopwatch navigation icon')
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

function patchAIHeroCopy(source) {
  return replaceExact(
    source,
    '<p>학교 정보를 묻고, 공지를 분석하고, 찾은 일정을 바로 S-Hub에 추가해.</p>',
    '<p>학교 정보를 묻고, 공지를 분석하고, 찾은 일정을 바로 S‑Hub에 추가할 수 있어요.</p>',
    'AI hero non-breaking S-Hub copy',
  )
}

export function patchStudyVisualPolishSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/main.jsx')) return patchStudyNavIcon(source)
  if (cleanId.endsWith('/src/preview-study.jsx')) return patchStudyHeader(source)
  if (cleanId.endsWith('/src/preview-board.css')) return patchBoardCopyWrapping(source)
  if (cleanId.endsWith('/src/s-hub-ai.css')) return patchAICopyWrapping(source)
  if (cleanId.endsWith('/src/s-hub-ai-sheet.jsx')) return patchAIHeroCopy(source)
  return String(source || '')
}
