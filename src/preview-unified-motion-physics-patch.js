function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview unified motion marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview unified motion range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const UNIFIED_REACTION_HOOK = String.raw`
function useClassNestedReactionFromMiniSpring(navRef, enabled) {
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || !enabled) return undefined

    function clearReaction() {
      nav.style.setProperty('--class-shell-react-x', '0px')
      nav.style.setProperty('--class-shell-react-scale-x', '1')
      nav.style.setProperty('--class-shell-react-scale-y', '1')
      nav.style.setProperty('--class-home-react-x', '0px')
      nav.style.setProperty('--class-ai-react-x', '0px')
      nav.style.setProperty('--class-study-react-x', '0px')
      nav.style.setProperty('--class-schedule-react-x', '0px')
    }

    function handleMiniFrame(event) {
      const detail = event?.detail || {}
      const velocity = Number(detail.velocity || 0)
      const { impulse, direction } = getSHubReactionFromVelocity(velocity, 1)
      if (!direction || impulse < 0.001) {
        clearReaction()
        nav.dispatchEvent(new Event('stationlayout'))
        return
      }

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
      } else {
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

    nav.addEventListener('shubminipillframe', handleMiniFrame)
    return () => {
      nav.removeEventListener('shubminipillframe', handleMiniFrame)
      clearReaction()
    }
  }, [navRef, enabled])
}

function useClassCollapseSettledGuard(navRef, collapsing, setCollapsing, releaseTimerRef) {
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || !collapsing) return undefined

    function finish() {
      if (releaseTimerRef.current) {
        window.clearTimeout(releaseTimerRef.current)
        releaseTimerRef.current = 0
      }
      setCollapsing(false)
    }

    function handleLayoutFrame(event) {
      const detail = event?.detail || {}
      if (detail.target !== 0 || !detail.settled) return
      finish()
    }

    nav.addEventListener('shubclasslayoutframe', handleLayoutFrame)
    return () => nav.removeEventListener('shubclasslayoutframe', handleLayoutFrame)
  }, [navRef, collapsing, setCollapsing, releaseTimerRef])
}
`

export function patchPreviewUnifiedMotionPhysicsSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  let next = String(source || '')

  next = replaceRequired(
    next,
    "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n",
    "import { buildSchoolAIContext } from './s-hub-ai-core.js'\nimport { getSHubPillVisual, getSHubReactionFromVelocity, isSHubSpringSettled, stepSHubSpring1D } from './s-hub-motion-physics.js'\n",
    'shared physics import',
  )

  next = replaceRequired(
    next,
    `      const speed = Math.abs(physics.velocity)\n      const stretch = Math.min(speed * 0.032, 18)\n      const movingRight = physics.velocity > 0\n      const movingLeft = physics.velocity < 0\n      const visualX = movingLeft ? physics.x - stretch : physics.x\n      const visualWidth = physics.baseWidth + stretch\n      const compression = Math.min(speed / 18000, 0.028)`,
    `      const visual = getSHubPillVisual(physics.x, physics.velocity, physics.baseWidth)\n      const { speed, stretch, movingRight, movingLeft, visualX, visualWidth, compression } = visual`,
    'main pill visual physics',
  )

  next = replaceRequired(
    next,
    `      const stiffness = 56\n      const damping = 10.5\n      const mass = 1\n      const displacement = physics.x - physics.targetX\n      const springForce = -stiffness * displacement\n      const dampingForce = -damping * physics.velocity\n      const acceleration = (springForce + dampingForce) / mass\n\n      physics.velocity += acceleration * dt\n      physics.x += physics.velocity * dt`,
    `      stepSHubSpring1D(physics, physics.targetX, dt)`,
    'main pill shared step',
  )

  next = replaceRequired(
    next,
    `      const settled = Math.abs(physics.x - physics.targetX) < 0.06 && Math.abs(physics.velocity) < 0.06`,
    `      const settled = isSHubSpringSettled(physics, physics.targetX)`,
    'main pill shared settling',
  )

  next = replaceRequired(
    next,
    `      const speed = Math.abs(physics.velocity)\n      const stretch = Math.min(speed * 0.032, 18)\n      const movingRight = physics.velocity > 0\n      const movingLeft = physics.velocity < 0\n      const visualX = movingLeft ? physics.x - stretch : physics.x\n      const visualWidth = physics.baseWidth + stretch\n      const compression = Math.min(speed / 18000, 0.028)\n\n      indicator.style.setProperty('width', visualWidth + 'px', 'important')\n      indicator.style.setProperty('transform', 'translate3d(' + visualX + 'px, 0, 0) scaleY(' + (1 - compression) + ')', 'important')\n      indicator.style.setProperty('border-radius', Math.max(12, 16 - stretch * 0.08) + 'px', 'important')\n      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'`,
    `      const visual = getSHubPillVisual(physics.x, physics.velocity, physics.baseWidth, { minRadius: 12, baseRadius: 16 })\n      indicator.style.setProperty('width', visual.visualWidth + 'px', 'important')\n      indicator.style.setProperty('transform', 'translate3d(' + visual.visualX + 'px, 0, 0) scaleY(' + (1 - visual.compression) + ')', 'important')\n      indicator.style.setProperty('border-radius', visual.radius + 'px', 'important')\n      indicator.dataset.direction = visual.direction\n      container.dispatchEvent(new CustomEvent('shubminipillframe', { detail: {\n        x: physics.x,\n        velocity: physics.velocity,\n        targetX: physics.targetX,\n        baseWidth: physics.baseWidth,\n        visualX: visual.visualX,\n        visualWidth: visual.visualWidth,\n        stretch: visual.stretch,\n        compression: visual.compression,\n        direction: visual.direction,\n      } }))`,
    'mini pill shared visual and frame event',
  )

  next = replaceRequired(
    next,
    `      const stiffness = 56\n      const damping = 10.5\n      const mass = 1\n      const displacement = physics.x - physics.targetX\n      const springForce = -stiffness * displacement\n      const dampingForce = -damping * physics.velocity\n      const acceleration = (springForce + dampingForce) / mass\n\n      physics.velocity += acceleration * dt\n      physics.x += physics.velocity * dt`,
    `      stepSHubSpring1D(physics, physics.targetX, dt)`,
    'mini pill shared step',
  )

  next = replaceRequired(
    next,
    `      const settled = Math.abs(physics.x - physics.targetX) < 0.06 && Math.abs(physics.velocity) < 0.06`,
    `      const settled = isSHubSpringSettled(physics, physics.targetX)`,
    'mini pill shared settling',
  )

  next = replaceRequired(
    next,
    `      const stiffness = 56\n      const damping = 10.5\n      const mass = 1\n      const displacement = physics.progress - physics.target\n      const springForce = -stiffness * displacement\n      const dampingForce = -damping * physics.velocity\n      const acceleration = (springForce + dampingForce) / mass\n\n      physics.velocity += acceleration * dt\n      physics.progress += physics.velocity * dt`,
    `      const channel = { x: physics.progress, velocity: physics.velocity }\n      stepSHubSpring1D(channel, physics.target, dt)\n      physics.progress = channel.x\n      physics.velocity = channel.velocity`,
    'layout shared step',
  )

  next = replaceRequired(
    next,
    `      const settled = Math.abs(physics.progress - physics.target) < 0.0008 && Math.abs(physics.velocity) < 0.0008`,
    `      const settled = isSHubSpringSettled({ x: physics.progress, velocity: physics.velocity }, physics.target, 0.0008, 0.0008)`,
    'layout shared settling',
  )

  next = replaceRequired(
    next,
    `      nav.dispatchEvent(new Event('stationlayout'))`,
    `      nav.dispatchEvent(new Event('stationlayout'))\n      nav.dispatchEvent(new CustomEvent('shubclasslayoutframe', { detail: {\n        progress: physics.progress,\n        velocity: physics.velocity,\n        target: physics.target,\n        classWidth,\n        sideWidth,\n        settled: isSHubSpringSettled({ x: physics.progress, velocity: physics.velocity }, physics.target, 0.0008, 0.0008),\n      } }))`,
    'layout shared frame event',
  )

  next = spliceRequired(
    next,
    `function useClassNestedReactionSpring(navRef, section, enabled) {`,
    `function AppShell({ profile }) {`,
    `${UNIFIED_REACTION_HOOK}\nfunction AppShell({ profile }) {`,
    'remove duplicate nested spring and use real mini frame',
  )

  next = replaceRequired(
    next,
    `  useClassNestedReactionSpring(navRef, classSection, classNavExpanded || classNavCollapsing)`,
    `  useClassNestedReactionFromMiniSpring(navRef, classNavExpanded || classNavCollapsing)`,
    'nested reaction hookup',
  )

  return next
}
