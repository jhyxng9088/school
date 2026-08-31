import { useLayoutEffect, useRef } from 'react'

export const STATION_PHYSICS = Object.freeze({
  stiffness: 56,
  damping: 10.5,
  mass: 1,
  maxDt: 0.032,
  settleDistance: 0.06,
  settleVelocity: 0.06,
  stretchPerVelocity: 0.032,
  maxStretch: 18,
  compressionVelocity: 18000,
  maxCompression: 0.028,
})

export function stepStationSpring(state, target, dtSeconds) {
  const dt = Math.min(Math.max(Number(dtSeconds) || 0, 0), STATION_PHYSICS.maxDt)
  const displacement = state.value - target
  const springForce = -STATION_PHYSICS.stiffness * displacement
  const dampingForce = -STATION_PHYSICS.damping * state.velocity
  const acceleration = (springForce + dampingForce) / STATION_PHYSICS.mass
  state.velocity += acceleration * dt
  state.value += state.velocity * dt
  return state
}

export function stationPillVisual(x, velocity, width, { baseRadius = 20, minRadius = 16 } = {}) {
  const speed = Math.abs(velocity)
  const stretch = Math.min(speed * STATION_PHYSICS.stretchPerVelocity, STATION_PHYSICS.maxStretch)
  const movingLeft = velocity < 0
  const visualX = movingLeft ? x - stretch : x
  const visualWidth = width + stretch
  const compression = Math.min(speed / STATION_PHYSICS.compressionVelocity, STATION_PHYSICS.maxCompression)
  return {
    speed,
    stretch,
    visualX,
    visualWidth,
    visualRight: visualX + visualWidth,
    compression,
    direction: velocity > 0 ? 'right' : velocity < 0 ? 'left' : 'still',
    radius: Math.max(minRadius, baseRadius - stretch * 0.08),
  }
}

function springSettled(channel, target, distance = STATION_PHYSICS.settleDistance, velocity = STATION_PHYSICS.settleVelocity) {
  return Math.abs(channel.value - target) < distance && Math.abs(channel.velocity) < velocity
}

export function useElasticPillSpring(activeIndex, {
  enabled = true,
  elasticOuterShell = false,
  frameEvent = '',
  geometryEvent = 'stationgeometry',
  pressureHostRef = null,
  pressurePadding = 0,
  baseRadius = 20,
  minRadius = 16,
} = {}) {
  const containerRef = useRef(null)
  const indicatorRef = useRef(null)
  const buttonRefs = useRef([])
  const physicsRef = useRef({
    x: { value: 0, velocity: 0 },
    width: { value: 0, velocity: 0 },
    targetX: 0,
    targetWidth: 0,
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
    if (elasticOuterShell) {
      container.dataset.elasticShell = 'true'
      container.style.setProperty('--nav-shell-scale-x', '1')
      container.style.setProperty('--nav-shell-shift-x', '0px')
    }

    function emitPressure(leftPressure, rightPressure, visual) {
      const host = pressureHostRef?.current
      if (!host) return
      host.dispatchEvent(new CustomEvent('stationpressure', {
        detail: {
          left: leftPressure,
          right: rightPressure,
          velocity: physics.x.velocity,
          stretch: visual.stretch,
        },
      }))
    }

    function paint() {
      const visual = stationPillVisual(
        physics.x.value,
        physics.x.velocity,
        physics.width.value,
        { baseRadius, minRadius },
      )

      indicator.style.setProperty('width', `${visual.visualWidth}px`, 'important')
      indicator.style.setProperty(
        'transform',
        `translate3d(${visual.visualX}px, 0, 0) scaleY(${1 - visual.compression})`,
        'important',
      )
      indicator.style.setProperty('border-radius', `${visual.radius}px`, 'important')
      indicator.dataset.direction = visual.direction

      const padding = pressurePadding || 0
      const leftPressure = Math.max(0, padding - visual.visualX)
      const rightPressure = Math.max(0, visual.visualRight - (container.clientWidth - padding))
      emitPressure(leftPressure, rightPressure, visual)

      if (elasticOuterShell) {
        const style = window.getComputedStyle(container)
        const navPadding = Number.parseFloat(style.getPropertyValue('--nav-padding')) || 5
        const leftShellStretch = Math.max(0, navPadding - visual.visualX)
        const rightShellStretch = Math.max(0, visual.visualRight - (container.clientWidth - navPadding))
        const shellScaleX = (container.clientWidth + leftShellStretch + rightShellStretch) / container.clientWidth
        const shellShiftX = (rightShellStretch - leftShellStretch) / 2
        container.style.setProperty('--nav-shell-scale-x', shellScaleX.toFixed(5))
        container.style.setProperty('--nav-shell-shift-x', `${shellShiftX}px`)
      }

      if (frameEvent) {
        container.dispatchEvent(new CustomEvent(frameEvent, {
          detail: {
            activeIndex,
            x: physics.x.value,
            velocity: physics.x.velocity,
            width: physics.width.value,
            targetX: physics.targetX,
            targetWidth: physics.targetWidth,
            visual,
            settled: springSettled(physics.x, physics.targetX) && springSettled(physics.width, physics.targetWidth),
          },
        }))
      }
    }

    function measure({ snap = false } = {}) {
      const currentTarget = buttonRefs.current[activeIndex]
      if (!currentTarget) return
      const containerRect = container.getBoundingClientRect()
      const buttonRect = currentTarget.getBoundingClientRect()
      physics.targetX = buttonRect.left - containerRect.left
      physics.targetWidth = buttonRect.width

      if (!physics.initialized || snap || reduceMotion) {
        physics.initialized = true
        physics.x.value = physics.targetX
        physics.x.velocity = 0
        physics.width.value = physics.targetWidth
        physics.width.velocity = 0
        paint()
      }
    }

    function stopAnimation() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function needsAnimation() {
      return !springSettled(physics.x, physics.targetX) || !springSettled(physics.width, physics.targetWidth)
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, STATION_PHYSICS.maxDt)
      physics.lastTime = time

      stepStationSpring(physics.x, physics.targetX, dt)
      stepStationSpring(physics.width, physics.targetWidth, dt)
      paint()

      if (!needsAnimation()) {
        physics.x.value = physics.targetX
        physics.x.velocity = 0
        physics.width.value = physics.targetWidth
        physics.width.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        paint()
        return
      }
      physics.frame = requestAnimationFrame(animate)
    }

    function ensureAnimation() {
      if (reduceMotion || physics.frame !== null || !needsAnimation()) return
      physics.lastTime = 0
      physics.frame = requestAnimationFrame(animate)
    }

    stopAnimation()
    measure({ snap: !physics.initialized })
    ensureAnimation()

    const handleGeometry = () => {
      measure({ snap: false })
      ensureAnimation()
    }
    const handleViewport = () => {
      stopAnimation()
      physics.lastTime = 0
      measure({ snap: true })
    }

    if (geometryEvent) container.addEventListener(geometryEvent, handleGeometry)
    window.addEventListener('resize', handleViewport)
    window.addEventListener('orientationchange', handleViewport)
    window.visualViewport?.addEventListener('resize', handleViewport)

    return () => {
      stopAnimation()
      if (geometryEvent) container.removeEventListener(geometryEvent, handleGeometry)
      window.removeEventListener('resize', handleViewport)
      window.removeEventListener('orientationchange', handleViewport)
      window.visualViewport?.removeEventListener('resize', handleViewport)
    }
  }, [activeIndex, enabled, elasticOuterShell, frameEvent, geometryEvent, pressureHostRef, pressurePadding, baseRadius, minRadius])

  return { containerRef, indicatorRef, buttonRefs, physicsRef }
}

export function useClassStationWidthSpring(navRef, requestedOpen) {
  const physicsRef = useRef({
    width: { value: 0, velocity: 0 },
    targetWidth: 0,
    closedWidth: 0,
    openWidth: 0,
    innerWidth: 0,
    padding: 5,
    engaged: false,
    pressureLeft: 0,
    pressureRight: 0,
    initialized: false,
    frame: null,
    lastTime: 0,
  })

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
      if (!physics.initialized) {
        physics.width.value = physics.closedWidth
        physics.width.velocity = 0
        physics.initialized = true
      }
    }

    function updateTarget() {
      const pressure = physics.engaged ? physics.pressureLeft + physics.pressureRight : 0
      physics.targetWidth = physics.engaged ? physics.openWidth + pressure : physics.closedWidth
    }

    function paint() {
      const width = Math.max(physics.closedWidth, Math.min(physics.openWidth + 20, physics.width.value))
      const sideWidth = Math.max(0, (physics.innerWidth - width) / 4)
      const center = physics.padding + sideWidth + width / 2
      const denominator = Math.max(1, physics.openWidth - physics.closedWidth)
      const progress = Math.max(0, Math.min(1, (width - physics.closedWidth) / denominator))

      nav.style.setProperty('--station-class-current', `${width}px`)
      nav.style.setProperty('--station-side-current', `${sideWidth}px`)
      nav.style.setProperty('--class-capsule-center', `${center}px`)
      nav.style.setProperty('--class-progress', progress.toFixed(5))
      nav.style.setProperty('--class-overlay-opacity', Math.max(0, Math.min(1, progress * 1.22)).toFixed(5))
      nav.style.setProperty('--class-button-opacity', Math.max(0, 1 - progress * 1.35).toFixed(5))
      nav.dataset.classEngaged = physics.engaged ? 'true' : 'false'
      nav.dataset.classInteractive = requestedOpen && progress > 0.93 ? 'true' : 'false'
      nav.dispatchEvent(new Event('stationgeometry'))
    }

    function stop() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function settled() {
      return springSettled(physics.width, physics.targetWidth)
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, STATION_PHYSICS.maxDt)
      physics.lastTime = time
      updateTarget()
      stepStationSpring(physics.width, physics.targetWidth, dt)
      paint()
      if (settled()) {
        physics.width.value = physics.targetWidth
        physics.width.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        paint()
        return
      }
      physics.frame = requestAnimationFrame(animate)
    }

    function ensureAnimation() {
      updateTarget()
      if (reduceMotion) {
        physics.width.value = physics.targetWidth
        physics.width.velocity = 0
        paint()
        return
      }
      if (physics.frame === null && !settled()) {
        physics.lastTime = 0
        physics.frame = requestAnimationFrame(animate)
      }
    }

    measureGeometry()
    if (!requestedOpen) {
      physics.engaged = false
      physics.pressureLeft = 0
      physics.pressureRight = 0
      ensureAnimation()
    } else if (reduceMotion) {
      physics.engaged = true
      ensureAnimation()
    } else {
      updateTarget()
      paint()
    }

    function handleMainFrame(event) {
      if (!requestedOpen) return
      const detail = event?.detail || {}
      if (detail.activeIndex !== 1 || !detail.settled || physics.engaged) return
      physics.engaged = true
      ensureAnimation()
    }

    function handlePressure(event) {
      const detail = event?.detail || {}
      physics.pressureLeft = Math.max(0, Number(detail.left || 0))
      physics.pressureRight = Math.max(0, Number(detail.right || 0))
      if (physics.engaged) ensureAnimation()
    }

    function handleViewport() {
      stop()
      measureGeometry()
      updateTarget()
      physics.width.value = physics.targetWidth
      physics.width.velocity = 0
      paint()
    }

    nav.addEventListener('mainpillframe', handleMainFrame)
    nav.addEventListener('stationpressure', handlePressure)
    window.addEventListener('resize', handleViewport)
    window.addEventListener('orientationchange', handleViewport)

    paint()

    return () => {
      stop()
      nav.removeEventListener('mainpillframe', handleMainFrame)
      nav.removeEventListener('stationpressure', handlePressure)
      window.removeEventListener('resize', handleViewport)
      window.removeEventListener('orientationchange', handleViewport)
    }
  }, [navRef, requestedOpen])
}
