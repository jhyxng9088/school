const NESTED_REACTION_CSS = `
/* Preview-only nested station interaction refinement. */
.bottom-nav[data-class-layout-spring="true"] .class-nav-capsule {
  background: var(--surface-glass) !important;
  box-shadow: inset 0 0 0 0.5px var(--border), 0 5px 18px rgba(0,0,0,.12) !important;
  transform:
    translate3d(-50%, 0, 0)
    translate3d(var(--class-shell-react-x, 0px), 0, 0)
    scaleX(var(--class-shell-react-scale-x, 1))
    scaleY(var(--class-shell-react-scale-y, 1)) !important;
  transform-origin: 50% 58%;
  transition: opacity 150ms ease !important;
  will-change: width, transform, opacity;
}

.bottom-nav[data-class-layout-spring="true"] .class-nav-mini-pill {
  background: var(--surface) !important;
  border: 0 !important;
  box-shadow: inset 0 0 0 0.5px var(--border) !important;
  opacity: 1 !important;
  visibility: visible !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="home"] {
  transform:
    translate3d(var(--class-home-react-x, 0px), 0, 0)
    scaleX(var(--station-item-scale-x, 1))
    scaleY(var(--station-item-scale-y, 1));
}

.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="ai"] {
  transform:
    translate3d(var(--class-ai-react-x, 0px), 0, 0)
    scaleX(var(--station-item-scale-x, 1))
    scaleY(var(--station-item-scale-y, 1));
}

.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="study"] {
  transform:
    translate3d(var(--class-study-react-x, 0px), 0, 0)
    scaleX(var(--station-item-scale-x, 1))
    scaleY(var(--station-item-scale-y, 1));
}

.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="schedule"] {
  transform:
    translate3d(var(--class-schedule-react-x, 0px), 0, 0)
    scaleX(var(--station-item-scale-x, 1))
    scaleY(var(--station-item-scale-y, 1));
}

.class-nav-subbutton,
.class-nav-subbutton span,
.class-nav-subbutton svg {
  transition: none !important;
}

.class-nav-subbutton.is-active,
.class-nav-subbutton.is-active span,
.class-nav-subbutton.is-active svg {
  color: var(--text) !important;
  opacity: 1 !important;
}

.bottom-nav.is-class-collapsing .class-nav-capsule {
  pointer-events: none !important;
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview nested station marker missing: ${label}`)
  return source.replace(marker, replacement)
}

const NESTED_INTERACTION_HOOKS = String.raw`
function useClassNestedReactionSpring(navRef, section, enabled) {
  const physicsRef = useRef({
    x: section === 'board' ? 1 : 0,
    velocity: 0,
    target: section === 'board' ? 1 : 0,
    frame: null,
    lastTime: 0,
    initialized: false,
  })

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || !enabled) return undefined
    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    physics.target = section === 'board' ? 1 : 0

    function clearReaction() {
      nav.style.setProperty('--class-shell-react-x', '0px')
      nav.style.setProperty('--class-shell-react-scale-x', '1')
      nav.style.setProperty('--class-shell-react-scale-y', '1')
      nav.style.setProperty('--class-home-react-x', '0px')
      nav.style.setProperty('--class-ai-react-x', '0px')
      nav.style.setProperty('--class-study-react-x', '0px')
      nav.style.setProperty('--class-schedule-react-x', '0px')
    }

    function paint() {
      const capsule = nav.querySelector('.class-nav-capsule')
      const travel = Math.max(42, ((capsule?.getBoundingClientRect().width || 126) - 8) / 2)
      const pixelVelocity = physics.velocity * travel
      const direction = pixelVelocity > 0 ? 1 : pixelVelocity < 0 ? -1 : 0
      const impulse = Math.min(Math.abs(pixelVelocity) * 0.038, 7.5)
      const shellShift = direction * impulse * 0.72
      const shellScaleX = 1 + Math.min(impulse / 210, 0.038)
      const shellScaleY = 1 - Math.min(impulse / 620, 0.013)

      let homePush = 0
      let aiPush = 0
      let studyPush = 0
      let schedulePush = 0
      if (direction > 0) {
        homePush = -impulse * 0.22
        aiPush = impulse * 0.78
        studyPush = impulse * 0.38
        schedulePush = impulse * 0.14
      } else if (direction < 0) {
        homePush = -impulse * 0.78
        aiPush = impulse * 0.24
        studyPush = impulse * 0.10
        schedulePush = impulse * 0.04
      }

      nav.style.setProperty('--class-shell-react-x', shellShift.toFixed(3) + 'px')
      nav.style.setProperty('--class-shell-react-scale-x', shellScaleX.toFixed(5))
      nav.style.setProperty('--class-shell-react-scale-y', shellScaleY.toFixed(5))
      nav.style.setProperty('--class-home-react-x', homePush.toFixed(3) + 'px')
      nav.style.setProperty('--class-ai-react-x', aiPush.toFixed(3) + 'px')
      nav.style.setProperty('--class-study-react-x', studyPush.toFixed(3) + 'px')
      nav.style.setProperty('--class-schedule-react-x', schedulePush.toFixed(3) + 'px')
      nav.dispatchEvent(new Event('stationlayout'))
    }

    function stop() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, 0.032)
      physics.lastTime = time

      const stiffness = 56
      const damping = 10.5
      const mass = 1
      const displacement = physics.x - physics.target
      const acceleration = ((-stiffness * displacement) + (-damping * physics.velocity)) / mass
      physics.velocity += acceleration * dt
      physics.x += physics.velocity * dt
      paint()

      const settled = Math.abs(physics.x - physics.target) < 0.0008 && Math.abs(physics.velocity) < 0.0008
      if (settled) {
        physics.x = physics.target
        physics.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        clearReaction()
        nav.dispatchEvent(new Event('stationlayout'))
        return
      }
      physics.frame = requestAnimationFrame(animate)
    }

    stop()
    if (!physics.initialized || reduceMotion) {
      physics.initialized = true
      physics.x = physics.target
      physics.velocity = 0
      clearReaction()
      return undefined
    }
    physics.lastTime = 0
    physics.frame = requestAnimationFrame(animate)

    return () => stop()
  }, [navRef, section, enabled])
}

function useClassCollapseSettledGuard(navRef, collapsing, setCollapsing, releaseTimerRef) {
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || !collapsing) return undefined
    let frame = 0
    let lastGap = Number.POSITIVE_INFINITY
    let stableFrames = 0

    function finish() {
      if (releaseTimerRef.current) {
        window.clearTimeout(releaseTimerRef.current)
        releaseTimerRef.current = 0
      }
      setCollapsing(false)
    }

    function tick() {
      const style = window.getComputedStyle(nav)
      const classWidth = Number.parseFloat(style.getPropertyValue('--station-class-current'))
      const sideWidth = Number.parseFloat(style.getPropertyValue('--station-side-current'))
      const gap = Number.isFinite(classWidth) && Number.isFinite(sideWidth)
        ? Math.abs(classWidth - sideWidth)
        : Number.POSITIVE_INFINITY
      const delta = Math.abs(gap - lastGap)
      lastGap = gap

      if (gap < 0.42 && delta < 0.035) stableFrames += 1
      else stableFrames = 0

      if (stableFrames >= 4) {
        finish()
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [navRef, collapsing, setCollapsing, releaseTimerRef])
}
`

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `function AppShell({ profile }) {`,
    `${NESTED_INTERACTION_HOOKS}\nfunction AppShell({ profile }) {`,
    'nested interaction hooks',
  )

  next = replaceRequired(
    next,
    `  const classMiniSpring = useStationLikePillSpring(classSection === 'board' ? 1 : 0, classNavExpanded || classNavCollapsing)\n  useClassStationLayoutSpring(navRef, classNavExpanded)`,
    `  const classMiniSpring = useStationLikePillSpring(classSection === 'board' ? 1 : 0, classNavExpanded || classNavCollapsing)\n  useClassStationLayoutSpring(navRef, classNavExpanded)\n  useClassNestedReactionSpring(navRef, classSection, classNavExpanded || classNavCollapsing)\n  useClassCollapseSettledGuard(navRef, classNavCollapsing, setClassNavCollapsing, classExitReleaseTimerRef)`,
    'nested spring hookups',
  )

  /* The final physical-coupling layer owns exit timing now. Keep this legacy layer
     from stretching the old 500ms release into a second independent 1800ms delay. */

  return next
}

export function patchPreviewNestedStationReactionSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only nested station interaction refinement.')) return current
    return `${current}\n${NESTED_REACTION_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
