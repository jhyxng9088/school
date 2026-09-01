import { cleanupPreviewStationNavRecoverySource } from './preview-station-nav-recovery-compat.js'

const STATION_NAV_REFINEMENT_CSS = `
/* Preview-only station motion refinement: expanded class slot redistributes
   the remaining four station buttons evenly instead of overlapping them. */
.bottom-nav {
  --class-open-width: clamp(122px, 34%, 142px);
  --station-side-slot: calc((100% - (var(--nav-padding) * 2) - var(--class-open-width)) / 4);
  grid-template-columns: repeat(5, var(--station-slot));
  transition: grid-template-columns 620ms cubic-bezier(.16, 1.08, .28, 1);
}

.bottom-nav.is-class-expanded {
  grid-template-columns:
    var(--station-side-slot)
    var(--class-open-width)
    var(--station-side-slot)
    var(--station-side-slot)
    var(--station-side-slot);
}

.bottom-nav .nav-button {
  min-width: 0;
  transform-origin: 50% 72%;
}

.class-nav-capsule {
  isolation: isolate;
  transition:
    left 620ms cubic-bezier(.16, 1.08, .28, 1),
    width 620ms cubic-bezier(.16, 1.08, .28, 1),
    transform 620ms cubic-bezier(.16, 1.08, .28, 1),
    opacity 220ms ease,
    border-radius 620ms cubic-bezier(.16, 1.08, .28, 1);
}

.bottom-nav.is-class-expanded .class-nav-capsule.is-open {
  left: calc(var(--nav-padding) + var(--station-side-slot) + (var(--class-open-width) * .5));
  width: var(--class-open-width);
}

/* During exit, keep the expanded capsule visible while it physically folds
   back into the ordinary class pill. The destination tab moves only after it settles. */
.bottom-nav.is-class-collapsing .class-nav-capsule {
  opacity: 1;
  pointer-events: none;
}

.bottom-nav.is-class-collapsing .nav-button[data-tab="class"] {
  opacity: 0;
  pointer-events: none;
}

.class-nav-subbutton,
.class-nav-subbutton svg,
.class-nav-subbutton span {
  -webkit-tap-highlight-color: transparent;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.class-nav-subbutton svg {
  opacity: 1 !important;
  transform: translate3d(0, 0, 0);
  transition: none !important;
  will-change: auto;
}

.class-nav-mini-pill {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

@media (max-width: 380px) {
  .bottom-nav {
    --class-open-width: clamp(118px, 35%, 128px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav {
    transition-duration: .01ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview station refinement marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `  const [classSection, setClassSection] = useState('timetable')\n  const [classNavExpanded, setClassNavExpanded] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')`,
    `  const [classSection, setClassSection] = useState('timetable')\n  const [classNavExpanded, setClassNavExpanded] = useState(false)\n  const [classNavCollapsing, setClassNavCollapsing] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')\n  const classExitTimerRef = useRef(0)\n  const classExitTargetRef = useRef('')`,
    'class transition state',
  )

  next = replaceRequired(
    next,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      return undefined\n    }\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 250)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => {`,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      setClassNavCollapsing(false)\n      return undefined\n    }\n    setClassNavCollapsing(false)\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 220)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n  }, [])\n\n  useEffect(() => {`,
    'class expansion and exit cleanup',
  )

  next = replaceRequired(
    next,
    `  function changeTab(nextTab) {\n    if (nextTab === 'ai') setAiOpen(true)\n    if (nextTab === activeTabRef.current) return\n    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)\n    if (nextIndex < 0) return\n    const previousIndex = activeIndexRef.current\n    activeTabRef.current = nextTab\n    activeIndexRef.current = nextIndex\n    setContentDirection(nextIndex > previousIndex ? 1 : -1)\n    setActiveTab(nextTab)\n  }`,
    `  function commitStationTab(nextTab) {\n    if (nextTab === 'ai') setAiOpen(true)\n    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)\n    if (nextIndex < 0 || nextTab === activeTabRef.current) return\n    const previousIndex = activeIndexRef.current\n    activeTabRef.current = nextTab\n    activeIndexRef.current = nextIndex\n    setContentDirection(nextIndex > previousIndex ? 1 : -1)\n    setActiveTab(nextTab)\n  }\n\n  function changeTab(nextTab) {\n    if (nextTab === activeTabRef.current) {\n      if (nextTab === 'class' && classExitTimerRef.current) {\n        window.clearTimeout(classExitTimerRef.current)\n        classExitTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        setClassNavExpanded(true)\n      }\n      return\n    }\n\n    if (activeTabRef.current === 'class' && (classNavExpanded || classNavCollapsing || classExitTimerRef.current)) {\n      if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n      classExitTargetRef.current = nextTab\n      setClassNavExpanded(false)\n      setClassNavCollapsing(true)\n      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        classExitTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        if (target) commitStationTab(target)\n      }, 520)\n      return\n    }\n\n    commitStationTab(nextTab)\n  }`,
    'staged class exit',
  )

  next = replaceRequired(
    next,
    `        className={\`bottom-nav ${'${classNavExpanded ? \'is-class-expanded\' : \'\'}'}\`}`,
    `        className={\`bottom-nav ${'${classNavExpanded ? \'is-class-expanded\' : \'\'}'} ${'${classNavCollapsing ? \'is-class-collapsing\' : \'\'}'}\`}`,
    'collapsing nav class',
  )

  return next
}

export function patchPreviewStationNavRefinementSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only station motion refinement')) return current
    return `${current}\n${STATION_NAV_REFINEMENT_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  const refined = patchMainSource(source)
  return cleanupPreviewStationNavRecoverySource(refined, cleanId)
}
