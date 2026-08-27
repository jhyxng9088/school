import { useEffect, useRef } from 'react'

const POINT_COUNT = 96
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SPHERE_POINTS = Array.from({ length: POINT_COUNT }, (_, index) => {
  const y = 1 - ((index + 0.5) / POINT_COUNT) * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = index * GOLDEN_ANGLE
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius }
})

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function SHubAIOrb({ size = 24, active = false, className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const cssSize = clamp(Number(size) || 24, 18, 96)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(cssSize * dpr)
    canvas.height = Math.round(cssSize * dpr)
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let lastTick = performance.now()
    let lastDraw = 0
    let angle = 0
    let cachedColor = ''
    let colorCheckedAt = 0

    function profile(timeSeconds) {
      if (!active) return { radiusScale: 1, speed: 0.14, tilt: 0.28 }
      const cycle = timeSeconds % 9.6
      let radiusScale = 1
      let speed = 0.22
      if (cycle >= 1.8 && cycle < 4.0) {
        const phase = (cycle - 1.8) / 2.2
        radiusScale = 1 - 0.48 * Math.sin(Math.PI * phase)
      }
      if (cycle >= 4.0 && cycle < 6.8) {
        const phase = (cycle - 4.0) / 2.8
        speed = 0.22 + 1.08 * Math.sin(Math.PI * phase)
      } else if (cycle >= 6.8) {
        const phase = (cycle - 6.8) / 2.8
        speed = 0.22 + 0.5 * Math.pow(1 - clamp(phase, 0, 1), 2)
      }
      return {
        radiusScale,
        speed,
        tilt: 0.28 + 0.055 * Math.sin(timeSeconds * 0.72),
      }
    }

    function draw(time, force = false) {
      if (!force && time - lastDraw < 31) return
      const delta = Math.min(Math.max((time - lastTick) / 1000, 0), 0.06)
      lastTick = time
      lastDraw = time
      const state = profile(time / 1000)
      angle += state.speed * delta

      if (!cachedColor || time - colorCheckedAt > 700) {
        cachedColor = getComputedStyle(canvas).color || '#8e8e93'
        colorCheckedAt = time
      }

      const center = cssSize / 2
      const sphereRadius = cssSize * 0.39 * state.radiusScale
      const cosY = Math.cos(angle)
      const sinY = Math.sin(angle)
      const cosX = Math.cos(state.tilt)
      const sinX = Math.sin(state.tilt)
      const projected = SPHERE_POINTS.map((point) => {
        const xY = point.x * cosY + point.z * sinY
        const zY = -point.x * sinY + point.z * cosY
        const yX = point.y * cosX - zY * sinX
        const zX = point.y * sinX + zY * cosX
        const perspective = 1 / (1 - zX * 0.27)
        return {
          x: center + xY * sphereRadius * perspective,
          y: center + yX * sphereRadius * perspective,
          z: zX,
          perspective,
        }
      }).sort((a, b) => a.z - b.z)

      context.clearRect(0, 0, cssSize, cssSize)
      context.fillStyle = cachedColor
      const baseDot = Math.max(0.55, Math.min(1.08, cssSize * 0.018))
      projected.forEach((point) => {
        const depth = (point.z + 1) / 2
        context.globalAlpha = 0.24 + depth * 0.7
        context.beginPath()
        context.arc(point.x, point.y, baseDot * (0.72 + depth * 0.62) * point.perspective, 0, Math.PI * 2)
        context.fill()
      })
      context.globalAlpha = 1
    }

    function tick(time) {
      if (!document.hidden) draw(time)
      frame = window.requestAnimationFrame(tick)
    }

    if (reducedMotion.matches) draw(performance.now(), true)
    else frame = window.requestAnimationFrame(tick)

    const handleVisibility = () => {
      lastTick = performance.now()
      if (!document.hidden && reducedMotion.matches) draw(lastTick, true)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [active, size])

  return (
    <span
      className={`s-hub-ai-orb ${active ? 'is-thinking' : 'is-idle'} ${className}`.trim()}
      style={{ '--s-hub-ai-orb-size': `${size}px` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </span>
  )
}
