import { useLayoutEffect, useRef } from 'react'

export const S_HUB_SEGMENT_SPRING_PHYSICS = Object.freeze({
  stiffness: 56,
  damping: 10.5,
  mass: 1,
  maxDt: 0.032,
  stretchPerVelocity: 0.032,
  maxStretch: 18,
  compressionVelocity: 18000,
  maxCompression: 0.028,
  radiusShrinkPerStretch: 0.08,
  settleDistancePx: 0.06,
  settleVelocityPx: 0.06,
})

export function useSHubSegmentSpring(activeIndex, {
  paddingProperty = '--segment-padding',
  shellScaleProperty = '--segment-shell-scale-x',
  shellShiftProperty = '--segment-shell-shift-x',
  fallbackPadding = 5,
  baseRadius = 14,
  minRadius = 11,
} = {}) {
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
    if (!container || !indicator || !targetButton) return undefined

    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const padding = Number.parseFloat(window.getComputedStyle(container).getPropertyValue(paddingProperty)) || fallbackPadding

    indicator.dataset.springMotion = 'true'
    indicator.style.setProperty('left', '0px', 'important')
    indicator.style.setProperty('transition', 'none', 'important')

    function resetShell() {
      container.style.setProperty(shellScaleProperty, '1')
      container.style.setProperty(shellShiftProperty, '0px')
    }

    function paint() {
      const speed = Math.abs(physics.velocity)
      const stretch = Math.min(speed * S_HUB_SEGMENT_SPRING_PHYSICS.stretchPerVelocity, S_HUB_SEGMENT_SPRING_PHYSICS.maxStretch)
      const movingRight = physics.velocity > 0
      const movingLeft = physics.velocity < 0
      const visualX = movingLeft ? physics.x - stretch : physics.x
      const visualWidth = physics.baseWidth + stretch
      const compression = Math.min(speed / S_HUB_SEGMENT_SPRING_PHYSICS.compressionVelocity, S_HUB_SEGMENT_SPRING_PHYSICS.maxCompression)
      const visualRight = visualX + visualWidth
      const containerWidth = container.clientWidth || 1
      const leftShellStretch = Math.max(0, padding - visualX)
      const rightShellStretch = Math.max(0, visualRight - (containerWidth - padding))
      const shellScaleX = (containerWidth + leftShellStretch + rightShellStretch) / containerWidth
      const shellShiftX = (rightShellStretch - leftShellStretch) / 2

      container.style.setProperty(shellScaleProperty, shellScaleX.toFixed(5))
      container.style.setProperty(shellShiftProperty, shellShiftX.toFixed(3) + 'px')
      indicator.style.setProperty('width', visualWidth + 'px', 'important')
      indicator.style.setProperty('transform', 'translate3d(' + visualX + 'px, 0, 0) scaleY(' + (1 - compression) + ')', 'important')
      indicator.style.setProperty('border-radius', Math.max(minRadius, baseRadius - stretch * S_HUB_SEGMENT_SPRING_PHYSICS.radiusShrinkPerStretch) + 'px', 'important')
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
      const dt = Math.min((time - physics.lastTime) / 1000, S_HUB_SEGMENT_SPRING_PHYSICS.maxDt)
      physics.lastTime = time

      const displacement = physics.x - physics.targetX
      const springForce = -S_HUB_SEGMENT_SPRING_PHYSICS.stiffness * displacement
      const dampingForce = -S_HUB_SEGMENT_SPRING_PHYSICS.damping * physics.velocity
      const acceleration = (springForce + dampingForce) / S_HUB_SEGMENT_SPRING_PHYSICS.mass

      physics.velocity += acceleration * dt
      physics.x += physics.velocity * dt
      paint()

      const settled = Math.abs(physics.x - physics.targetX) < S_HUB_SEGMENT_SPRING_PHYSICS.settleDistancePx
        && Math.abs(physics.velocity) < S_HUB_SEGMENT_SPRING_PHYSICS.settleVelocityPx
      if (settled) {
        physics.x = physics.targetX
        physics.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        resetShell()
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

    const handleViewportChange = () => {
      stopAnimation()
      physics.lastTime = 0
      measure(true)
      resetShell()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('orientationchange', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)

    return () => {
      stopAnimation()
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
    }
  }, [activeIndex, paddingProperty, shellScaleProperty, shellShiftProperty, fallbackPadding, baseRadius, minRadius])

  return { containerRef, indicatorRef, buttonRefs }
}
