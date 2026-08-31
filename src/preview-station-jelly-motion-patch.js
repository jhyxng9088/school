const STATION_JELLY_CSS = `
/* Preview-only station physics reuse.
   Nested/class motion now uses the same spring equations as the main station pill. */
.bottom-nav[data-class-layout-spring="true"] {
  grid-template-columns:
    var(--station-side-current)
    var(--station-class-current)
    var(--station-side-current)
    var(--station-side-current)
    var(--station-side-current) !important;
  transition: none !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-button {
  min-width: 0;
  transform: scaleX(var(--station-item-scale-x, 1)) scaleY(var(--station-item-scale-y, 1));
  transform-origin: 50% 62%;
  transition: color 0ms linear, opacity 180ms ease !important;
  will-change: transform;
}

.bottom-nav[data-class-layout-spring="true"] .nav-button.active {
  color: var(--text);
}

.bottom-nav[data-class-layout-spring="true"] .class-nav-capsule {
  left: var(--class-capsule-center) !important;
  width: var(--station-class-current) !important;
  transform: translate3d(-50%, 0, 0) scaleX(1) !important;
  border-radius: 19px !important;
  transition: opacity 130ms ease !important;
  background: var(--surface);
}

.bottom-nav[data-class-layout-spring="true"].is-class-expanded .class-nav-capsule,
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .class-nav-capsule {
  opacity: 1;
}

.class-nav-mini-pill,
.class-nav-mini-pill.is-timetable,
.class-nav-mini-pill.is-board {
  left: 0;
  width: 0;
  transform: none;
  transition: none !important;
  border-radius: 16px;
  background: var(--surface) !important;
  box-shadow: inset 0 0 0 0.5px var(--border);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: width, transform;
}

.class-nav-subbutton {
  color: var(--text-tertiary);
  transition: transform 110ms var(--motion-ease) !important;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.class-nav-subbutton.is-active,
.class-nav-subbutton.is-active span,
.class-nav-subbutton.is-active svg {
  color: var(--text) !important;
  opacity: 1 !important;
  transition: none !important;
}

.class-nav-subbutton span,
.class-nav-subbutton svg {
  transition: none !important;
}

.class-nav-subbutton:active {
  transform: scale(.945) !important;
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav[data-class-layout-spring="true"] .nav-button,
  .class-nav-capsule,
  .class-nav-mini-pill,
  .class-nav-subbutton {
    transition-duration: .01ms !important;
  }
}
`

const STATION_STIFFNESS = 56
const STATION_DAMPING = 10.5
const STATION_MASS = 1

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview station physics marker missing: ${label}`)
  return source.replace(marker, replacement)
}

const SHARED_STATION_PHYSICS_HOOKS = String.raw`
function useStationLikePillSpring(activeIndex, enabled) {
  const containerRef = useRef(null)
  const indicatorRef = useRef(null)
  const buttonRefs = useRef([])
  const physicsRef = useRef({
    x: 0,
    velocity: 0,
    targetX: 0,
    baseWidth: 0,
    initialized: false,
    frame: null,
    lastTime: 0,
  })

  useLayoutEffect(() => {
    const container = containerRef.current
    const indicator = indicatorRef.current
    const targetButton = buttonRefs.current[activeIndex]
    if (!container || !indicator || !targetButton || !enabled) return undefined

    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    indicator.dataset.springMotion = 'true'
    indicator.style.setProperty('left', '0px', 'important')
    indicator.style.setProperty('transition', 'none', 'important')

    function paint() {
      const speed = Math.abs(physics.velocity)
      const stretch = Math.min(speed * 0.032, 18)
      const movingRight = physics.velocity > 0
      const movingLeft = physics.velocity < 0
      const visualX = movingLeft ? physics.x - stretch : physics.x
      const visualWidth = physics.baseWidth + stretch
      const compression = Math.min(speed / 18000, 0.028)

      indicator.style.setProperty('width', visualWidth + 'px', 'important')
      indicator.style.setProperty('transform', 'translate3d(' + visualX + 'px, 0, 0) scaleY(' + (1 - compression) + ')', 'important')
      indicator.style.setProperty('border-radius', Math.max(12, 16 - stretch * 0.08) + 'px', 'important')
      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'
    }

    function measure(immediate = false) {
      const containerRect = container.getBoundingClientRect()
      const buttonRect = targetButton.getBoundingClientRect()
      physics.targetX = buttonRect.left - containerRect.left
      physics.baseWidth = buttonRect.width

      if (!physics.initialized || immediate || reduceMotion) {
        physics.initialized = true
        physics.x = physics.targetX
        physics.velocity = 0
        paint()
      }
    }

    function stopAnimation() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, 0.032)
      physics.lastTime = time

      const stiffness = ${STATION_STIFFNESS}
      const damping = ${STATION_DAMPING}
      const mass = ${STATION_MASS}
      const displacement = physics.x - physics.targetX
      const springForce = -stiffness * displacement
      const dampingForce = -damping * physics.velocity
      const acceleration = (springForce + dampingForce) / mass

      physics.velocity += acceleration * dt
      physics.x += physics.velocity * dt
      paint()

      const settled = Math.abs(physics.x - physics.targetX) < 0.06 && Math.abs(physics.velocity) < 0.06
      if (settled) {
        physics.x = physics.targetX
        physics.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        paint()
        return
      }

      physics.frame = requestAnimationFrame(animate)
    }

    stopAnimation()
    measure(!physics.initialized)
    if (!reduceMotion && Math.abs(physics.x - physics.targetX) > 0.01) {
      physics.lastTime = 0
      physics.frame = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      stopAnimation()
      physics.lastTime = 0
      measure(true)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      stopAnimation()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [activeIndex, enabled])

  return { containerRef, indicatorRef, buttonRefs }
}

function useClassStationLayoutSpring(navRef, expanded) {
  const physicsRef = useRef({
    progress: 0,
    velocity: 0,
    target: 0,
    initialized: false,
    frame: null,
    lastTime: 0,
    closedWidth: 0,
    openWidth: 0,
    innerWidth: 0,
    padding: 5,
  })

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    nav.dataset.classLayoutSpring = 'true'
    physics.target = expanded ? 1 : 0

    function measureGeometry() {
      const style = window.getComputedStyle(nav)
      physics.padding = Number.parseFloat(style.getPropertyValue('--nav-padding')) || 5
      physics.innerWidth = Math.max(0, nav.clientWidth - physics.padding * 2)
      physics.closedWidth = physics.innerWidth / 5
      const compact = window.matchMedia('(max-width: 380px)').matches
      const minWidth = compact ? 118 : 122
      const maxWidth = compact ? 128 : 142
      const ratio = compact ? 0.35 : 0.34
      physics.openWidth = Math.min(maxWidth, Math.max(minWidth, nav.clientWidth * ratio))
    }

    function paint() {
      const widthDelta = physics.openWidth - physics.closedWidth
      const classWidth = physics.closedWidth + widthDelta * physics.progress
      const sideWidth = (physics.innerWidth - classWidth) / 4
      const center = physics.padding + sideWidth + classWidth / 2
      const pixelVelocity = physics.velocity * Math.abs(widthDelta)
      const speed = Math.abs(pixelVelocity)
      const stretch = Math.min(speed * 0.032, 18)
      const compression = Math.min(speed / 18000, 0.028)
      const itemScaleX = 1 + Math.min(stretch / 360, 0.05)

      nav.style.setProperty('--station-class-current', classWidth + 'px')
      nav.style.setProperty('--station-side-current', sideWidth + 'px')
      nav.style.setProperty('--class-capsule-center', center + 'px')
      nav.style.setProperty('--station-item-scale-x', itemScaleX.toFixed(5))
      nav.style.setProperty('--station-item-scale-y', (1 - compression).toFixed(5))
      nav.dispatchEvent(new Event('stationlayout'))
    }

    function stopAnimation() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, 0.032)
      physics.lastTime = time

      const stiffness = ${STATION_STIFFNESS}
      const damping = ${STATION_DAMPING}
      const mass = ${STATION_MASS}
      const displacement = physics.progress - physics.target
      const springForce = -stiffness * displacement
      const dampingForce = -damping * physics.velocity
      const acceleration = (springForce + dampingForce) / mass

      physics.velocity += acceleration * dt
      physics.progress += physics.velocity * dt
      paint()

      const settled = Math.abs(physics.progress - physics.target) < 0.0008 && Math.abs(physics.velocity) < 0.0008
      if (settled) {
        physics.progress = physics.target
        physics.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        paint()
        return
      }
      physics.frame = requestAnimationFrame(animate)
    }

    measureGeometry()
    if (!physics.initialized || reduceMotion) {
      physics.initialized = true
      physics.progress = physics.target
      physics.velocity = 0
      paint()
    } else {
      stopAnimation()
      physics.lastTime = 0
      physics.frame = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      measureGeometry()
      paint()
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      stopAnimation()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [navRef, expanded])
}
`

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `function AppShell({ profile }) {`,
    `${SHARED_STATION_PHYSICS_HOOKS}\nfunction AppShell({ profile }) {`,
    'shared station physics hooks',
  )

  next = replaceRequired(
    next,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)`,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n  const classMiniSpring = useStationLikePillSpring(classSection === 'board' ? 1 : 0, classNavExpanded || classNavCollapsing)\n  useClassStationLayoutSpring(navRef, classNavExpanded)`,
    'station spring hookups',
  )

  next = replaceRequired(
    next,
    `    window.visualViewport?.addEventListener('resize', handleViewportChange)\n\n    return () => {\n      stopAnimation()\n      window.removeEventListener('resize', handleViewportChange)\n      window.removeEventListener('orientationchange', handleViewportChange)\n      window.visualViewport?.removeEventListener('resize', handleViewportChange)`,
    `    window.visualViewport?.addEventListener('resize', handleViewportChange)\n\n    const handleStationLayoutFrame = () => {\n      const movingTarget = buttonRefs.current[activeIndex]\n      if (!movingTarget) return\n      const navRect = nav.getBoundingClientRect()\n      const buttonRect = movingTarget.getBoundingClientRect()\n      physics.targetX = buttonRect.left - navRect.left\n      physics.baseWidth = buttonRect.width\n      if (reduceMotion) {\n        physics.x = physics.targetX\n        physics.velocity = 0\n        paint()\n        return\n      }\n      if (physics.frame === null && Math.abs(physics.x - physics.targetX) > 0.01) {\n        physics.lastTime = 0\n        physics.frame = requestAnimationFrame(animate)\n      }\n    }\n    nav.addEventListener('stationlayout', handleStationLayoutFrame)\n\n    return () => {\n      stopAnimation()\n      nav.removeEventListener('stationlayout', handleStationLayoutFrame)\n      window.removeEventListener('resize', handleViewportChange)\n      window.removeEventListener('orientationchange', handleViewportChange)\n      window.visualViewport?.removeEventListener('resize', handleViewportChange)`,
    'main pill follows moving station targets',
  )

  next = replaceRequired(
    next,
    `  const [classNavCollapsing, setClassNavCollapsing] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')\n  const classExitTimerRef = useRef(0)\n  const classExitTargetRef = useRef('')`,
    `  const [classNavCollapsing, setClassNavCollapsing] = useState(false)\n  const [scheduleSection, setScheduleSection] = useState('todo')\n  const classExitTimerRef = useRef(0)\n  const classExitReleaseTimerRef = useRef(0)\n  const classExitTargetRef = useRef('')`,
    'class exit timers',
  )

  next = replaceRequired(
    next,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      setClassNavCollapsing(false)\n      return undefined\n    }\n    setClassNavCollapsing(false)\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 220)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n  }, [])`,
    `  useEffect(() => {\n    if (activeTab !== 'class') {\n      setClassNavExpanded(false)\n      return undefined\n    }\n    if (!classExitTimerRef.current) setClassNavCollapsing(false)\n    const timer = window.setTimeout(() => setClassNavExpanded(true), 170)\n    return () => window.clearTimeout(timer)\n  }, [activeTab])\n\n  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n    if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n  }, [])`,
    'continuous class expansion and cleanup',
  )

  next = replaceRequired(
    next,
    `      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        classExitTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        if (target) commitStationTab(target)\n      }, 520)`,
    `      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        classExitTargetRef.current = ''\n        if (target) commitStationTab(target)\n        classExitTimerRef.current = 0\n        if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n        classExitReleaseTimerRef.current = window.setTimeout(() => {\n          classExitReleaseTimerRef.current = 0\n          setClassNavCollapsing(false)\n        }, 500)\n      }, 180)`,
    'overlapped exit without a motion gap',
  )

  next = replaceRequired(
    next,
    `            onPointerDown={(event) => {\n              if (event.pointerType !== 'mouse') changeTab(tab.id)\n            }}\n            onClick={() => changeTab(tab.id)}`,
    `            onClick={() => changeTab(tab.id)}`,
    'single station tap dispatch',
  )

  next = replaceRequired(
    next,
    `        <div\n          className={\`class-nav-capsule ${'${classNavExpanded ? \'is-open\' : \'\'}'}\`}\n          aria-hidden={!classNavExpanded}\n        >\n          <span className={\`class-nav-mini-pill ${'${classSection === \'board\' ? \'is-board\' : \'is-timetable\'}'}\`} aria-hidden="true" />`,
    `        <div\n          ref={classMiniSpring.containerRef}\n          className={\`class-nav-capsule ${'${classNavExpanded ? \'is-open\' : \'\'}'}\`}\n          aria-hidden={!classNavExpanded}\n        >\n          <span ref={classMiniSpring.indicatorRef} className={\`class-nav-mini-pill ${'${classSection === \'board\' ? \'is-board\' : \'is-timetable\'}'}\`} aria-hidden="true" />`,
    'nested pill refs',
  )

  next = replaceRequired(
    next,
    `          <button\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'timetable\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}`,
    `          <button\n            ref={(node) => { classMiniSpring.buttonRefs.current[0] = node }}\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'timetable\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}`,
    'timetable nested target ref',
  )

  next = replaceRequired(
    next,
    `          <button\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'board\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}`,
    `          <button\n            ref={(node) => { classMiniSpring.buttonRefs.current[1] = node }}\n            type="button"\n            className={\`class-nav-subbutton ${'${classSection === \'board\' ? \'is-active\' : \'\'}'}\`}\n            tabIndex={classNavExpanded ? 0 : -1}`,
    'board nested target ref',
  )

  return next
}

export function patchPreviewStationJellyMotionSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only station physics reuse')) return current
    return `${current}\n${STATION_JELLY_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
