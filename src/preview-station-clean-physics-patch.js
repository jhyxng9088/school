const CLEAN_STATION_CSS = `
/* Preview-only clean station physics.
   The original nav indicator remains the outer class pill; no visual clone replaces it. */
.bottom-nav.clean-station-physics {
  --station-class-current: var(--station-slot);
  --station-side-current: var(--station-slot);
  --class-progress: 0;
  --class-overlay-opacity: 0;
  --class-button-opacity: 1;
  grid-template-columns:
    var(--station-side-current)
    var(--station-class-current)
    var(--station-side-current)
    var(--station-side-current)
    var(--station-side-current) !important;
  transition: none !important;
}

.bottom-nav.clean-station-physics .nav-indicator {
  z-index: 1;
  opacity: 1 !important;
  transition: background 0ms linear, box-shadow 0ms linear !important;
}

.bottom-nav.clean-station-physics[data-class-engaged="true"] .nav-indicator {
  background: var(--surface-glass) !important;
  box-shadow: inset 0 0 0 0.5px var(--border), 0 5px 18px rgba(0,0,0,.10) !important;
}

.bottom-nav.clean-station-physics .nav-button {
  min-width: 0;
  transform: none !important;
  transition: color 0ms linear, opacity 110ms linear !important;
}

.bottom-nav.clean-station-physics .nav-button[data-tab="class"] {
  opacity: var(--class-button-opacity);
  pointer-events: none;
}

.bottom-nav.clean-station-physics .class-nav-capsule,
.bottom-nav.clean-station-physics .class-nav-capsule.is-open {
  position: absolute;
  z-index: 4;
  top: var(--nav-padding);
  bottom: var(--nav-padding);
  left: var(--class-capsule-center, calc(var(--nav-padding) + (var(--station-slot) * 1.5))) !important;
  width: var(--station-class-current) !important;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 4px;
  transform: translate3d(-50%, 0, 0) !important;
  overflow: hidden;
  opacity: var(--class-overlay-opacity) !important;
  border: 0 !important;
  border-radius: 20px !important;
  background: transparent !important;
  box-shadow: none !important;
  pointer-events: none;
  transition: none !important;
  will-change: width, left, opacity;
}

.bottom-nav.clean-station-physics[data-class-interactive="true"] .class-nav-capsule {
  pointer-events: auto;
}

.bottom-nav.clean-station-physics .class-nav-mini-pill,
.bottom-nav.clean-station-physics .class-nav-mini-pill.is-timetable,
.bottom-nav.clean-station-physics .class-nav-mini-pill.is-board {
  z-index: 0;
  top: 4px;
  bottom: 4px;
  left: 0 !important;
  width: 0;
  transform: none;
  opacity: 1 !important;
  visibility: visible !important;
  border: 0 !important;
  border-radius: 16px;
  background: var(--surface) !important;
  box-shadow: inset 0 0 0 0.5px var(--border), 0 2px 8px rgba(0,0,0,.08) !important;
  transition: none !important;
  pointer-events: none;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: width, transform;
}

.bottom-nav.clean-station-physics .class-nav-subbutton,
.bottom-nav.clean-station-physics .class-nav-subbutton span,
.bottom-nav.clean-station-physics .class-nav-subbutton svg {
  transition: none !important;
  -webkit-tap-highlight-color: transparent;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.bottom-nav.clean-station-physics .class-nav-subbutton {
  color: var(--text-tertiary);
}

.bottom-nav.clean-station-physics .class-nav-subbutton.is-active,
.bottom-nav.clean-station-physics .class-nav-subbutton.is-active span,
.bottom-nav.clean-station-physics .class-nav-subbutton.is-active svg {
  color: var(--text) !important;
  opacity: 1 !important;
}

.bottom-nav.clean-station-physics .class-nav-subbutton:active {
  transform: scale(.95) !important;
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav.clean-station-physics .nav-button,
  .bottom-nav.clean-station-physics .nav-indicator,
  .bottom-nav.clean-station-physics .class-nav-capsule,
  .bottom-nav.clean-station-physics .class-nav-mini-pill {
    transition-duration: .01ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Clean station physics marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Clean station physics range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `import { buildSchoolAIContext } from './s-hub-ai-core.js'\n`,
    `import { buildSchoolAIContext } from './s-hub-ai-core.js'\nimport { useClassStationWidthSpring, useElasticPillSpring } from './preview-station-physics-runtime.js'\n`,
    'shared runtime import',
  )

  next = spliceRequired(
    next,
    `function useNavSpring(activeIndex) {`,
    `function PreviewBoardPage() {`,
    `function useNavSpring(activeIndex) {\n  return useElasticPillSpring(activeIndex, {\n    elasticOuterShell: true,\n    frameEvent: 'mainpillframe',\n    geometryEvent: 'stationgeometry',\n    baseRadius: 20,\n    minRadius: 16,\n  })\n}\n\n`,
    'replace original nav spring with shared runtime',
  )

  next = replaceRequired(
    next,
    `  const [classSection, setClassSection] = useState('timetable')\n  const [classNavExpanded, setClassNavExpanded] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')`,
    `  const [classSection, setClassSection] = useState('timetable')\n  const [scheduleSection, setScheduleSection] = useState('todo')`,
    'remove staged class state',
  )

  next = replaceRequired(
    next,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n\n  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      return undefined\n    }\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 250)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => {`,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n  const classMiniSpring = useElasticPillSpring(classSection === 'board' ? 1 : 0, {\n    enabled: true,\n    geometryEvent: '',\n    pressureHostRef: navRef,\n    pressurePadding: 4,\n    baseRadius: 16,\n    minRadius: 12,\n  })\n  useClassStationWidthSpring(navRef, activeTab === 'class')\n\n  useEffect(() => {`,
    'shared spring hookups with no timer',
  )

  next = replaceRequired(
    next,
    `        className={\`bottom-nav ${'${classNavExpanded ? \'is-class-expanded\' : \'\'}'}\`}`,
    `        className="bottom-nav clean-station-physics"`,
    'single station class',
  )

  next = replaceRequired(
    next,
    `            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}`,
    `            onClick={() => changeTab(tab.id)}`,
    'single top-level tap target',
  )

  next = replaceRequired(
    next,
    `        <div\n          className={\`class-nav-capsule ${'${classNavExpanded ? \'is-open\' : \'\'}'}\`}\n          aria-hidden={!classNavExpanded}\n        >\n          <span className={\`class-nav-mini-pill ${'${classSection === \'board\' ? \'is-board\' : \'is-timetable\'}'}\`} aria-hidden="true" />`,
    `        <div\n          ref={classMiniSpring.containerRef}\n          className="class-nav-capsule"\n          aria-hidden={activeTab !== 'class'}\n        >\n          <span ref={classMiniSpring.indicatorRef} className="class-nav-mini-pill" aria-hidden="true" />`,
    'real nested spring container',
  )

  next = replaceRequired(
    next,
    `          <button\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'timetable\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}`,
    `          <button\n            ref={(node) => { classMiniSpring.buttonRefs.current[0] = node }}\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'timetable\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={activeTab === 'class' ? 0 : -1}`,
    'timetable mini target',
  )

  next = replaceRequired(
    next,
    `          <button\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'board\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}`,
    `          <button\n            ref={(node) => { classMiniSpring.buttonRefs.current[1] = node }}\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'board\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={activeTab === 'class' ? 0 : -1}`,
    'board mini target',
  )

  return next
}

export function patchPreviewCleanStationPhysicsSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only clean station physics.')) return current
    return `${current}\n${CLEAN_STATION_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
