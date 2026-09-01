const NAV_RESPONSIVENESS_CSS = `
/* Preview-only input responsiveness pass. Keep hit-testing as simple as production. */
.bottom-nav .nav-button,
.bottom-nav .class-nav-subbutton {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview nav responsiveness marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview nav responsiveness range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `  const classExitTargetRef = useRef('')`,
    `  const classExitTargetRef = useRef('')\n  const navTouchIntentRef = useRef({ key: '', at: 0 })`,
    'touch intent ref',
  )

  const fastChangeTab = `  function changeTab(nextTab) {\n    if (nextTab === activeTabRef.current) {\n      if (nextTab === 'class' && classNavCollapsing) {\n        if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n        if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n        classExitTimerRef.current = 0\n        classExitReleaseTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        setClassNavExpanded(true)\n      }\n      return\n    }\n\n    if (nextTab === 'class' && classNavCollapsing) {\n      if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n      if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n      classExitTimerRef.current = 0\n      classExitReleaseTimerRef.current = 0\n      classExitTargetRef.current = ''\n      setClassNavCollapsing(false)\n      setClassNavExpanded(true)\n      commitStationTab(nextTab)\n      return\n    }\n\n    if (activeTabRef.current === 'class' && (classNavExpanded || classNavCollapsing || classExitTimerRef.current)) {\n      if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n      if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n      classExitTimerRef.current = 0\n      classExitReleaseTimerRef.current = 0\n      classExitTargetRef.current = ''\n\n      /* Input commits immediately. The class station keeps collapsing physically in parallel,\n         so leaving 우리반 never blocks the destination page or active main indicator. */\n      setClassNavExpanded(false)\n      setClassNavCollapsing(true)\n      commitStationTab(nextTab)\n      return\n    }\n\n    commitStationTab(nextTab)\n  }`

  next = spliceRequired(
    next,
    `  function changeTab(nextTab) {`,
    `\n\n  return (`,
    fastChangeTab,
    'final changeTab function',
  )

  next = replaceRequired(
    next,
    `            onClick={() => changeTab(tab.id)}`,
    `            onPointerDown={(event) => {\n              if (event.pointerType === 'mouse') return\n              navTouchIntentRef.current = { key: tab.id, at: performance.now() }\n              changeTab(tab.id)\n            }}\n            onClick={() => {\n              const intent = navTouchIntentRef.current\n              if (intent.key === tab.id && performance.now() - intent.at < 700) {\n                navTouchIntentRef.current = { key: '', at: 0 }\n                return\n              }\n              changeTab(tab.id)\n            }}`,
    'top-level immediate touch input',
  )

  next = replaceRequired(
    next,
    `            onClick={() => setClassSection('timetable')}`,
    `            onPointerDown={(event) => {\n              if (event.pointerType === 'mouse') return\n              navTouchIntentRef.current = { key: 'class:timetable', at: performance.now() }\n              setClassSection('timetable')\n            }}\n            onClick={() => {\n              const intent = navTouchIntentRef.current\n              if (intent.key === 'class:timetable' && performance.now() - intent.at < 700) {\n                navTouchIntentRef.current = { key: '', at: 0 }\n                return\n              }\n              setClassSection('timetable')\n            }}`,
    'timetable immediate touch input',
  )

  next = replaceRequired(
    next,
    `            onClick={() => setClassSection('board')}`,
    `            onPointerDown={(event) => {\n              if (event.pointerType === 'mouse') return\n              navTouchIntentRef.current = { key: 'class:board', at: performance.now() }\n              setClassSection('board')\n            }}\n            onClick={() => {\n              const intent = navTouchIntentRef.current\n              if (intent.key === 'class:board' && performance.now() - intent.at < 700) {\n                navTouchIntentRef.current = { key: '', at: 0 }\n                return\n              }\n              setClassSection('board')\n            }}`,
    'board immediate touch input',
  )

  return next
}

export function patchPreviewNavResponsivenessSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only input responsiveness pass.')) return current
    return `${current}\n${NAV_RESPONSIVENESS_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
