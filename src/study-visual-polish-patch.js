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

function replaceOnceOrKeep(source, marker, replacement, label) {
  const current = String(source || '')
  if (current.includes(replacement)) return current
  return replaceExact(current, marker, replacement, label)
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
    return <svg {...common}><path d="M2.8 5.2c3.6-.9 6.7.1 9.2 2.8v11.2c-2.5-2.7-5.6-3.7-9.2-2.8V5.2Z"/><path d="M21.2 5.2c-3.6-.9-6.7.1-9.2 2.8v11.2c2.5-2.7 5.6-3.7 9.2-2.8V5.2Z"/><path d="M12 8v11.2"/></svg>
  }`

  return replaceOnceOrKeep(source, before, after, 'study open-book navigation icon')
}

function patchStudyHeader(source) {
  return replaceOnceOrKeep(
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

function patchBoardModalCloseMotion(source) {
  let next = String(source || '')

  next = replaceOnceOrKeep(
    next,
    'function BoardPostEditor({ post, sections, open, onClose, onUpdated, onDeleted }) {',
    `function BoardPostEditor({ post: incomingPost, sections, open, onClose, onUpdated, onDeleted }) {
  const retainedPostRef = useRef(incomingPost)
  if (incomingPost) retainedPostRef.current = incomingPost
  const post = incomingPost || retainedPostRef.current`,
    'board post editor retained close state',
  )

  next = replaceOnceOrKeep(
    next,
    'function BoardSectionEditor({ section, sections, open, onClose, onUpdated, onDeleted }) {',
    `function BoardSectionEditor({ section: incomingSection, sections, open, onClose, onUpdated, onDeleted }) {
  const retainedSectionRef = useRef(incomingSection)
  if (incomingSection) retainedSectionRef.current = incomingSection
  const section = incomingSection || retainedSectionRef.current`,
    'board section editor retained close state',
  )

  next = replaceOnceOrKeep(
    next,
    'function BoardDetail({ post, sections, meKey, open, onClose, onUpdated, onEditPost, onMutated }) {',
    `function BoardDetail({ post: incomingPost, sections, meKey, open, onClose, onUpdated, onEditPost, onMutated }) {
  const retainedPostRef = useRef(incomingPost)
  if (incomingPost) retainedPostRef.current = incomingPost
  const post = incomingPost || retainedPostRef.current`,
    'board detail retained close state',
  )

  return next
}

export function patchStudyVisualPolishSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/src/main.jsx')) return patchStudyNavIcon(source)
  if (cleanId.endsWith('/src/preview-study.jsx')) return patchStudyHeader(source)
  if (cleanId.endsWith('/src/preview-board-complete.jsx')) return patchBoardModalCloseMotion(source)
  if (cleanId.endsWith('/src/preview-board.css')) return patchBoardCopyWrapping(source)
  if (cleanId.endsWith('/src/s-hub-ai.css')) return patchAICopyWrapping(source)
  return String(source || '')
}
