from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one exact match, found {count}')
    write(path, text.replace(old, new, 1))


write('src/s-hub-ai-orb.jsx', r'''import { useEffect, useRef } from 'react'

const POINT_COUNT = 96
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SPHERE_POINTS = Array.from({ length: POINT_COUNT }, (_, index) => {
  const y = 1 - ((index + 0.5) / POINT_COUNT) * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = index * GOLDEN_ANGLE
  return { index, x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius }
})

const IDLE_PROFILE = {
  radiusScale: 1,
  speed: 0.14,
  tilt: 0.28,
  wave: 0,
  twist: 0,
  pulse: 0,
  roll: 0,
}

const THINKING_MOTIONS = [
  { name: 'focus', duration: [1450, 2200], radiusScale: 0.63, speed: 0.30, tilt: 0.24, wave: 0.008, twist: 0.025, pulse: 0.012, roll: -0.04 },
  { name: 'breathe', duration: [1700, 2700], radiusScale: 0.98, speed: 0.18, tilt: 0.30, wave: 0.025, twist: 0.04, pulse: 0.035, roll: 0.03 },
  { name: 'whirl', duration: [1200, 1850], radiusScale: 0.90, speed: 1.18, tilt: 0.40, wave: 0.018, twist: 0.23, pulse: 0.012, roll: 0.16 },
  { name: 'ripple', duration: [1550, 2350], radiusScale: 0.96, speed: 0.31, tilt: 0.33, wave: 0.11, twist: 0.08, pulse: 0.018, roll: -0.08 },
  { name: 'drift', duration: [1900, 2900], radiusScale: 1.02, speed: 0.12, tilt: 0.50, wave: 0.032, twist: 0.10, pulse: 0.020, roll: 0.22 },
  { name: 'bloom', duration: [1350, 2100], radiusScale: 1.08, speed: 0.39, tilt: 0.19, wave: 0.065, twist: 0.12, pulse: 0.028, roll: -0.15 },
  { name: 'scan', duration: [1450, 2250], radiusScale: 0.94, speed: 0.52, tilt: 0.56, wave: 0.022, twist: 0.28, pulse: 0.010, roll: 0.06 },
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function mix(from, to, amount) {
  return from + (to - from) * amount
}

function smoothstep(value) {
  const x = clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function chooseThinkingMotion(previousName = '') {
  const candidates = THINKING_MOTIONS.filter((motion) => motion.name !== previousName)
  return candidates[Math.floor(Math.random() * candidates.length)] || THINKING_MOTIONS[0]
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
    let motionName = ''
    let motionStart = lastTick
    let motionDuration = 1
    let motionFrom = { ...IDLE_PROFILE, speed: 0.22 }
    let motionTarget = { ...motionFrom }

    function startNextMotion(time, fromState) {
      const motion = chooseThinkingMotion(motionName)
      motionName = motion.name
      motionFrom = { ...fromState }
      motionTarget = {
        radiusScale: clamp(motion.radiusScale + randomBetween(-0.025, 0.025), 0.58, 1.11),
        speed: clamp(motion.speed * randomBetween(0.90, 1.10), 0.10, 1.34),
        tilt: clamp(motion.tilt + randomBetween(-0.035, 0.035), 0.12, 0.62),
        wave: clamp(motion.wave * randomBetween(0.88, 1.12), 0, 0.125),
        twist: clamp(motion.twist * randomBetween(0.88, 1.12), 0, 0.31),
        pulse: clamp(motion.pulse * randomBetween(0.88, 1.12), 0, 0.045),
        roll: clamp(motion.roll + randomBetween(-0.035, 0.035), -0.24, 0.26),
      }
      motionStart = time
      motionDuration = randomBetween(motion.duration[0], motion.duration[1])
    }

    function interpolatedMotion(time) {
      const amount = smoothstep((time - motionStart) / Math.max(motionDuration, 1))
      return {
        radiusScale: mix(motionFrom.radiusScale, motionTarget.radiusScale, amount),
        speed: mix(motionFrom.speed, motionTarget.speed, amount),
        tilt: mix(motionFrom.tilt, motionTarget.tilt, amount),
        wave: mix(motionFrom.wave, motionTarget.wave, amount),
        twist: mix(motionFrom.twist, motionTarget.twist, amount),
        pulse: mix(motionFrom.pulse, motionTarget.pulse, amount),
        roll: mix(motionFrom.roll, motionTarget.roll, amount),
      }
    }

    function profile(time) {
      if (!active) return IDLE_PROFILE
      let state = interpolatedMotion(time)
      if (time - motionStart >= motionDuration) {
        startNextMotion(time, state)
        state = { ...motionFrom }
      }
      const seconds = time / 1000
      return {
        ...state,
        radiusScale: state.radiusScale * (1 + state.pulse * Math.sin(seconds * 4.1)),
        tilt: state.tilt + 0.018 * Math.sin(seconds * 0.82),
      }
    }

    if (active) startNextMotion(lastTick, motionFrom)

    function draw(time, force = false) {
      if (!force && time - lastDraw < 31) return
      const delta = Math.min(Math.max((time - lastTick) / 1000, 0), 0.06)
      lastTick = time
      lastDraw = time
      const state = profile(time)
      angle += state.speed * delta

      if (!cachedColor || time - colorCheckedAt > 700) {
        cachedColor = getComputedStyle(canvas).color || '#8e8e93'
        colorCheckedAt = time
      }

      const center = cssSize / 2
      const sphereRadius = cssSize * 0.39 * state.radiusScale
      const cosX = Math.cos(state.tilt)
      const sinX = Math.sin(state.tilt)
      const cosRoll = Math.cos(state.roll)
      const sinRoll = Math.sin(state.roll)
      const seconds = time / 1000
      const projected = SPHERE_POINTS.map((point) => {
        const pointAngle = angle + state.twist * point.y
        const cosY = Math.cos(pointAngle)
        const sinY = Math.sin(pointAngle)
        const xY = point.x * cosY + point.z * sinY
        const zY = -point.x * sinY + point.z * cosY
        const yX = point.y * cosX - zY * sinX
        const zX = point.y * sinX + zY * cosX
        const ripple = 1 + state.wave * Math.sin(seconds * 3.25 + point.index * 0.71 + point.y * 2.4)
        const perspective = 1 / (1 - zX * 0.27)
        const localX = xY * sphereRadius * ripple * perspective
        const localY = yX * sphereRadius * ripple * perspective
        return {
          x: center + localX * cosRoll - localY * sinRoll,
          y: center + localX * sinRoll + localY * cosRoll,
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
''')

replace_once('src/s-hub-ai-sheet.jsx', '<SHubAIOrb size={64} active />', '<SHubAIOrb size={30} active />')

replace_once('src/s-hub-ai.css', '''.home-top-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 1px;
}
''', '''.home-top-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 1px;
}
''')

replace_once('src/s-hub-ai.css', '''.s-hub-ai-thinking-stage {
  display: grid;
  place-items: center;
  min-height: 74px;
  margin: -2px 0 2px;
  color: var(--text);
  animation: s-hub-ai-thinking-in 360ms var(--motion-ease) both;
}
''', '''.s-hub-ai-thinking-stage {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 2px;
  margin: -8px 0 -2px;
  color: var(--text-secondary);
  animation: s-hub-ai-thinking-in 360ms var(--motion-ease) both;
}
''')

replace_once('tests/reminder-original-scroll-ai-orb.test.js', '''  assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{64\\} active/)
  assert.match(orb, /POINT_COUNT = 96/)
  assert.match(orb, /requestAnimationFrame/)
  assert.match(orb, /radiusScale = 1 - 0\\.48/)
''', '''  assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{30\\} active/)
  assert.match(orb, /POINT_COUNT = 96/)
  assert.match(orb, /THINKING_MOTIONS = \\[/)
  assert.match(orb, /chooseThinkingMotion/)
  assert.match(orb, /Math\\.random\\(\\)/)
  assert.match(orb, /state\\.wave/)
  assert.match(orb, /state\\.twist/)
  assert.match(orb, /requestAnimationFrame/)
''')

replace_once('public/sw.js', "const CACHE_NAME = 'school-shell-v147'", "const CACHE_NAME = 'school-shell-v148'")

print('S-Hub AI orb refinement applied')
