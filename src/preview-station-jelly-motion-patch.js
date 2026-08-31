const STATION_JELLY_CSS = `
/* Preview-only station jelly motion pass.
   Keep the real grid/button hit regions aligned while adding elastic motion. */
.bottom-nav {
  transition: grid-template-columns 690ms cubic-bezier(.15, 1.24, .24, 1) !important;
}

.bottom-nav .nav-button {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: transform;
}

.bottom-nav.is-class-expanded .nav-button[data-tab="home"] {
  animation: station-side-jelly-left 700ms cubic-bezier(.16, 1, .3, 1) both;
}

.bottom-nav.is-class-expanded .nav-button[data-tab="ai"],
.bottom-nav.is-class-expanded .nav-button[data-tab="study"],
.bottom-nav.is-class-expanded .nav-button[data-tab="schedule"] {
  animation: station-side-jelly-right 700ms cubic-bezier(.16, 1, .3, 1) both;
}

.bottom-nav.is-class-collapsing .nav-button[data-tab="home"] {
  animation: station-side-jelly-right 650ms cubic-bezier(.16, 1, .3, 1) both;
}

.bottom-nav.is-class-collapsing .nav-button[data-tab="ai"],
.bottom-nav.is-class-collapsing .nav-button[data-tab="study"],
.bottom-nav.is-class-collapsing .nav-button[data-tab="schedule"] {
  animation: station-side-jelly-left 650ms cubic-bezier(.16, 1, .3, 1) both;
}

@keyframes station-side-jelly-left {
  0% { transform: translate3d(0, 0, 0) scaleX(1) scaleY(1); }
  28% { transform: translate3d(-3px, 0, 0) scaleX(1.065) scaleY(.975); }
  58% { transform: translate3d(1.5px, 0, 0) scaleX(.985) scaleY(1.012); }
  78% { transform: translate3d(-.7px, 0, 0) scaleX(1.008) scaleY(.996); }
  100% { transform: translate3d(0, 0, 0) scaleX(1) scaleY(1); }
}

@keyframes station-side-jelly-right {
  0% { transform: translate3d(0, 0, 0) scaleX(1) scaleY(1); }
  28% { transform: translate3d(3px, 0, 0) scaleX(1.065) scaleY(.975); }
  58% { transform: translate3d(-1.5px, 0, 0) scaleX(.985) scaleY(1.012); }
  78% { transform: translate3d(.7px, 0, 0) scaleX(1.008) scaleY(.996); }
  100% { transform: translate3d(0, 0, 0) scaleX(1) scaleY(1); }
}

.class-nav-capsule {
  transition:
    left 640ms cubic-bezier(.15, 1.20, .24, 1),
    width 640ms cubic-bezier(.15, 1.20, .24, 1),
    transform 640ms cubic-bezier(.15, 1.20, .24, 1),
    opacity 180ms ease,
    border-radius 640ms cubic-bezier(.15, 1.20, .24, 1) !important;
}

.class-nav-mini-pill {
  transition: none !important;
  transform-origin: 50% 50%;
}

.class-nav-mini-pill.is-timetable {
  animation: class-mini-jelly-left 660ms cubic-bezier(.16, 1, .3, 1) both;
}

.class-nav-mini-pill.is-board {
  animation: class-mini-jelly-right 660ms cubic-bezier(.16, 1, .3, 1) both;
}

@keyframes class-mini-jelly-right {
  0% { transform: translate3d(0, 0, 0) scaleX(.96) scaleY(1); }
  30% { transform: translate3d(66%, 0, 0) scaleX(1.12) scaleY(.965); }
  58% { transform: translate3d(104%, 0, 0) scaleX(.92) scaleY(1.018); }
  78% { transform: translate3d(98.5%, 0, 0) scaleX(.985) scaleY(.994); }
  100% { transform: translate3d(100%, 0, 0) scaleX(.96) scaleY(1); }
}

@keyframes class-mini-jelly-left {
  0% { transform: translate3d(100%, 0, 0) scaleX(.96) scaleY(1); }
  30% { transform: translate3d(34%, 0, 0) scaleX(1.12) scaleY(.965); }
  58% { transform: translate3d(-4%, 0, 0) scaleX(.92) scaleY(1.018); }
  78% { transform: translate3d(1.5%, 0, 0) scaleX(.985) scaleY(.994); }
  100% { transform: translate3d(0, 0, 0) scaleX(.96) scaleY(1); }
}

.class-nav-subbutton:active {
  transform: scale(.955) !important;
  transition: transform 100ms ease-out !important;
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav,
  .bottom-nav .nav-button,
  .class-nav-capsule,
  .class-nav-mini-pill {
    animation: none !important;
    transition-duration: .01ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview station jelly marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `  const [classNavCollapsing, setClassNavCollapsing] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')\n  const classExitTimerRef = useRef(0)\n  const classExitTargetRef = useRef('')`,
    `  const [classNavCollapsing, setClassNavCollapsing] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')\n  const classExitTimerRef = useRef(0)\n  const classExitReleaseTimerRef = useRef(0)\n  const classExitTargetRef = useRef('')`,
    'class exit timers',
  )

  next = replaceRequired(
    next,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      setClassNavCollapsing(false)\n      return undefined\n    }\n    setClassNavCollapsing(false)\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 220)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n  }, [])`,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      if (!classNavCollapsing) setClassNavCollapsing(false)\n      return undefined\n    }\n    if (!classExitTimerRef.current) setClassNavCollapsing(false)\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 210)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n    if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n  }, [])`,
    'overlapped class exit effect',
  )

  next = replaceRequired(
    next,
    `      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        classExitTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        if (target) commitStationTab(target)\n      }, 520)`,
    `      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        classExitTargetRef.current = ''\n        if (target) commitStationTab(target)\n        classExitTimerRef.current = 0\n        if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n        classExitReleaseTimerRef.current = window.setTimeout(() => {\n          classExitReleaseTimerRef.current = 0\n          setClassNavCollapsing(false)\n        }, 310)\n      }, 300)`,
    'overlap destination motion with collapse',
  )

  next = replaceRequired(
    next,
    `            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}`,
    `            onClick={() => changeTab(tab.id)}`,
    'single top-level tap dispatch',
  )

  return next
}

export function patchPreviewStationJellyMotionSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only station jelly motion pass')) return current
    return `${current}\n${STATION_JELLY_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
