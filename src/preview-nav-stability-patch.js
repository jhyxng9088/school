const NAV_STABILITY_CSS = `
/* Preview-only final nav stability pass.
   The spring owns visibility directly: no CSS transition may trail a per-frame physics value. */
.bottom-nav[data-class-layout-spring="true"] .class-nav-capsule,
.bottom-nav[data-class-layout-spring="true"].is-class-expanded .class-nav-capsule,
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .class-nav-capsule {
  transition: none !important;
  opacity: var(--class-overlay-opacity, 0) !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="class"] {
  opacity: var(--class-return-opacity, 1) !important;
  transition: color 0ms linear, transform 0ms linear, opacity 0ms linear !important;
}

.bottom-nav[data-class-layout-spring="true"].is-class-expanded .nav-button[data-tab="class"],
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .nav-button[data-tab="class"] {
  pointer-events: none !important;
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview nav stability marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview nav stability range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function replaceBlockRequired(source, startMarker, endMarker, transform, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview nav stability block missing: ${label}`)
  const current = source.slice(start, end)
  return `${source.slice(0, start)}${transform(current)}${source.slice(end)}`
}

function patchMainSource(source) {
  let next = String(source || '')

  /* The 700ms synthetic-click bookkeeping introduced another input state machine.
     Production already handles pointerdown + click safely because activeTabRef changes synchronously. */
  next = replaceRequired(
    next,
    `  const navTouchIntentRef = useRef({ key: '', at: 0 })\n`,
    ``,
    'remove touch suppression state',
  )

  /* The legacy settled guard forced getComputedStyle every animation frame.
     The actual class spring already emits classlayoutexithandoff from its own state. */
  next = replaceRequired(
    next,
    `  useClassCollapseSettledGuard(navRef, classNavCollapsing, setClassNavCollapsing, classExitReleaseTimerRef)\n`,
    ``,
    'remove forced-style collapse guard',
  )

  /* Entering class starts in the same input transaction. No 170ms empty-station delay. */
  next = spliceRequired(
    next,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      return undefined\n    }`,
    `\n\n  useEffect(() => () => {`,
    `  useEffect(() => {\n    if (activeTab === 'class') {\n      setClassNavExpanded(true)\n      setClassNavCollapsing(false)\n      return\n    }\n    setClassNavExpanded(false)\n  }, [activeTab])`,
    'immediate class expansion effect',
  )

  /* Keep one deterministic navigation state machine. Destination commits immediately;
     class geometry collapses in parallel and never owns the destination input. */
  const stableChangeTab = `  function changeTab(nextTab) {\n    if (nextTab === activeTabRef.current) {\n      if (nextTab === 'class' && classNavCollapsing) {\n        if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n        if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n        classExitTimerRef.current = 0\n        classExitReleaseTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        setClassNavExpanded(true)\n      }\n      return\n    }\n\n    if (nextTab === 'class') {\n      if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n      if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n      classExitTimerRef.current = 0\n      classExitReleaseTimerRef.current = 0\n      classExitTargetRef.current = ''\n      setClassNavCollapsing(false)\n      setClassNavExpanded(true)\n      commitStationTab(nextTab)\n      return\n    }\n\n    if (activeTabRef.current === 'class') {\n      if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n      if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n      classExitTimerRef.current = 0\n      classExitReleaseTimerRef.current = 0\n      classExitTargetRef.current = ''\n      setClassNavExpanded(false)\n      setClassNavCollapsing(true)\n      commitStationTab(nextTab)\n      return\n    }\n\n    commitStationTab(nextTab)\n  }`

  next = spliceRequired(
    next,
    `  function changeTab(nextTab) {`,
    `\n\n  return (`,
    stableChangeTab,
    'single final changeTab',
  )

  /* Match production input semantics: touch reacts on pointerdown, the following click
     becomes a harmless no-op through activeTabRef instead of a second timer/state machine. */
  next = spliceRequired(
    next,
    `            onPointerDown={(event) => {\n              if (event.pointerType === 'mouse') return\n              navTouchIntentRef.current = { key: tab.id, at: performance.now() }`,
    `            aria-current={activeTab === tab.id ? 'page' : undefined}`,
    `            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}\n`,
    'production-like top-level touch input',
  )

  next = spliceRequired(
    next,
    `            onPointerDown={(event) => {\n              if (event.pointerType === 'mouse') return\n              navTouchIntentRef.current = { key: 'class:timetable', at: performance.now() }`,
    `          >\n            <Icon type="timetable"`,
    `            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') setClassSection('timetable')\n            }}\n            onClick={() => setClassSection('timetable')}\n`,
    'production-like timetable touch input',
  )

  next = spliceRequired(
    next,
    `            onPointerDown={(event) => {\n              if (event.pointerType === 'mouse') return\n              navTouchIntentRef.current = { key: 'class:board', at: performance.now() }`,
    `          >\n            <Icon type="board"`,
    `            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') setClassSection('board')\n            }}\n            onClick={() => setClassSection('board')}\n`,
    'production-like board touch input',
  )

  /* Smallest-pill geometry is analytically known from the two equal class columns.
     Do not force two DOM layout reads for every outer-station spring frame. */
  next = replaceBlockRequired(
    next,
    'function useStationLikePillSpring(activeIndex, enabled) {',
    'function useClassStationLayoutSpring(navRef, expanded) {',
    (block) => {
      let nested = block
      nested = replaceRequired(
        nested,
        `      const containerWidth = container.clientWidth || 1`,
        `      const containerWidth = Math.max(1, physics.baseWidth * 2 + 10)`,
        'cached nested container width',
      )
      nested = spliceRequired(
        nested,
        `    const syncWithParentStation = () => {`,
        `\n\n    const handleResize = () => {`,
        `    const syncWithParentStation = () => {\n      const baseClassWidth = Number.parseFloat(stationHost?.style.getPropertyValue('--station-class-current'))\n      if (!Number.isFinite(baseClassWidth) || baseClassWidth <= 10) return\n      const inset = 5\n      const buttonWidth = Math.max(0, (baseClassWidth - inset * 2) / 2)\n      physics.targetX = inset + (activeIndex * buttonWidth)\n      physics.baseWidth = buttonWidth\n\n      if (reduceMotion) {\n        physics.x = physics.targetX\n        physics.velocity = 0\n        paint()\n        return\n      }\n\n      paint()\n      if (physics.frame === null && Math.abs(physics.x - physics.targetX) > 0.01) {\n        physics.lastTime = 0\n        physics.frame = requestAnimationFrame(animate)\n      }\n    }`,
        'layout-read-free nested station sync',
      )
      return nested
    },
    'smallest pill stability',
  )

  /* Crossfade from the original class icon into the two nested destinations from one
     spring value. At every progress value their opacities sum to one, so no blank capsule. */
  next = replaceBlockRequired(
    next,
    'function useClassStationLayoutSpring(navRef, expanded) {',
    'function useClassNestedReactionSpring(navRef, section, enabled) {',
    (block) => {
      let layout = block
      layout = replaceRequired(
        layout,
        `      const overlayOpacity = Math.max(0, Math.min(1, (classProgress - 0.34) / 0.45))\n      const classReturnOpacity = Math.max(0, Math.min(1, (0.38 - classProgress) / 0.26))`,
        `      const overlayOpacity = Math.max(0, Math.min(1, (classProgress - 0.08) / 0.35))\n      const classReturnOpacity = 1 - overlayOpacity`,
        'continuous class crossfade',
      )
      return layout
    },
    'class station visibility stability',
  )

  /* stationlayout is emitted every class spring frame. Derive every main-tab target from
     the already-written inline grid values and avoid getBoundingClientRect in that hot path. */
  next = spliceRequired(
    next,
    `    const handleStationLayoutFrame = () => {`,
    `\n    nav.addEventListener('stationlayout', handleStationLayoutFrame)`,
    `    const handleStationLayoutFrame = () => {\n      const inlineNumber = (name) => Number.parseFloat(nav.style.getPropertyValue(name))\n      const classWidth = inlineNumber('--station-class-actual') || inlineNumber('--station-class-current')\n      const leftWidth = inlineNumber('--station-left-actual') || inlineNumber('--station-side-current')\n      const rightWidth = inlineNumber('--station-right-actual') || inlineNumber('--station-side-current')\n\n      if (Number.isFinite(classWidth) && classWidth > 0 && Number.isFinite(leftWidth) && leftWidth > 0 && Number.isFinite(rightWidth) && rightWidth > 0) {\n        let targetX = 5\n        let targetWidth = leftWidth\n        if (activeIndex === 1) {\n          targetX = 5 + leftWidth\n          targetWidth = classWidth\n        } else if (activeIndex >= 2) {\n          targetX = 5 + leftWidth + classWidth + ((activeIndex - 2) * rightWidth)\n          targetWidth = rightWidth\n        }\n\n        physics.targetX = targetX\n        physics.baseWidth = targetWidth\n        const directClassOwner = nav.dataset.nestedGeometryFollow === 'true' && activeIndex === 1\n        if (directClassOwner || reduceMotion) {\n          stopAnimation()\n          physics.x = physics.targetX\n          physics.velocity = 0\n          physics.lastTime = 0\n          paint()\n          return\n        }\n        if (physics.frame === null && Math.abs(physics.x - physics.targetX) > 0.01) {\n          physics.lastTime = 0\n          physics.frame = requestAnimationFrame(animate)\n        }\n        return\n      }\n\n      const movingTarget = buttonRefs.current[activeIndex]\n      if (!movingTarget) return\n      const navRect = nav.getBoundingClientRect()\n      const buttonRect = movingTarget.getBoundingClientRect()\n      physics.targetX = buttonRect.left - navRect.left\n      physics.baseWidth = buttonRect.width\n      if (reduceMotion) {\n        physics.x = physics.targetX\n        physics.velocity = 0\n        paint()\n        return\n      }\n      if (physics.frame === null && Math.abs(physics.x - physics.targetX) > 0.01) {\n        physics.lastTime = 0\n        physics.frame = requestAnimationFrame(animate)\n      }\n    }`,
    'cached main station targets',
  )

  /* The spring's own handoff also owns collapse cleanup. Never poll computed styles. */
  next = spliceRequired(
    next,
    `    const handleClassExitHandoff = () => {`,
    `\n\n    nav.addEventListener('classlayoutexithandoff', handleClassExitHandoff)`,
    `    const handleClassExitHandoff = () => {\n      const target = classExitTargetRef.current\n      if (classExitTimerRef.current) {\n        window.clearTimeout(classExitTimerRef.current)\n        classExitTimerRef.current = 0\n      }\n      classExitTargetRef.current = ''\n      if (target) commitStationTab(target)\n      setClassNavCollapsing(false)\n    }`,
    'spring-owned collapse cleanup',
  )

  return next
}

export function patchPreviewNavStabilitySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only final nav stability pass.')) return current
    return `${current}\n${NAV_STABILITY_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
