import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous guard: ${label}`)
  return text.slice(0, first) + to + text.slice(first + from.length)
}

{
  const path = 'src/main.jsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text,
`  function removeChange(targetDate, period) {
    const key = dateKey(targetDate)
    const next = { ...overrides }
    const dateOverrides = { ...(next[key] || {}) }
    delete dateOverrides[period]
    if (Object.keys(dateOverrides).length) next[key] = dateOverrides
    else delete next[key]
    onSaveOverrides(next)
  }
`,
`  function removeChange(targetDate, period) {
    const key = dateKey(targetDate)
    const next = { ...overrides }
    const dateOverrides = { ...(next[key] || {}) }
    delete dateOverrides[period]
    if (Object.keys(dateOverrides).length) next[key] = dateOverrides
    else delete next[key]
    onSaveOverrides(next)
  }

  function clearAllChanges() {
    if (!Object.keys(overrides || {}).length) return
    onSaveOverrides({})
  }
`,
    'clear all timetable changes')

  text = replaceOnce(text,
`        <section className="week-changes">
          <h2>이번 주 변경</h2>
          <div className="change-list">`,
`        <section className="week-changes">
          <div className="week-changes-head">
            <h2>이번 주 변경</h2>
            <button className="clear-changes" onClick={clearAllChanges}>변경 모두 지우기</button>
          </div>
          <div className="change-list">`,
    'clear changes button')
  fs.writeFileSync(path, text)
}

{
  const path = 'public/school-timetable-motion.js'
  let text = fs.readFileSync(path, 'utf8')
  const start = text.indexOf("  document.addEventListener('click', (event) => {\n    const button = event.target.closest('.remove-change')")
  if (start < 0) throw new Error('Missing guard: remove-change interception')
  const endMarker = "  }, true)\n\n  const observer = new MutationObserver"
  const end = text.indexOf(endMarker, start)
  if (end < 0) throw new Error('Missing guard: remove-change interception end')
  text = text.slice(0, start) + '  // Revert buttons execute their React handler immediately; motion must never block data changes.\n\n  const observer = new MutationObserver' + text.slice(end + endMarker.length)
  fs.writeFileSync(path, text)
}

{
  const path = 'src/timetable.css'
  let text = fs.readFileSync(path, 'utf8')
  const css = `

.week-changes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.week-changes-head h2 {
  margin: 0;
}

.clear-changes {
  border: 0;
  background: transparent;
  color: var(--muted, #8e8e93);
  font: inherit;
  font-size: 12px;
  opacity: 0.72;
  padding: 6px 0 6px 10px;
}
`
  if (!text.includes('.week-changes-head {')) text += css
  fs.writeFileSync(path, text)
}

{
  const path = 'public/sw.js'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "const CACHE_NAME = 'school-shell-v82'", "const CACHE_NAME = 'school-shell-v83'", 'service worker cache')
  fs.writeFileSync(path, text)
}
