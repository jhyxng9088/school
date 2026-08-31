export const SHUB_MOTION_PHYSICS = Object.freeze({
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

export function stepSHubSpring1D(state, target, dtSeconds) {
  const dt = Math.min(Math.max(Number(dtSeconds) || 0, 0), SHUB_MOTION_PHYSICS.maxDt)
  const displacement = state.x - target
  const springForce = -SHUB_MOTION_PHYSICS.stiffness * displacement
  const dampingForce = -SHUB_MOTION_PHYSICS.damping * state.velocity
  const acceleration = (springForce + dampingForce) / SHUB_MOTION_PHYSICS.mass

  state.velocity += acceleration * dt
  state.x += state.velocity * dt
  return state
}

export function isSHubSpringSettled(state, target, distance = SHUB_MOTION_PHYSICS.settleDistance, velocity = SHUB_MOTION_PHYSICS.settleVelocity) {
  return Math.abs(state.x - target) < distance && Math.abs(state.velocity) < velocity
}

export function getSHubPillVisual(position, velocity, baseWidth, { minRadius = 16, baseRadius = 20 } = {}) {
  const speed = Math.abs(velocity)
  const stretch = Math.min(speed * SHUB_MOTION_PHYSICS.stretchPerVelocity, SHUB_MOTION_PHYSICS.maxStretch)
  const movingRight = velocity > 0
  const movingLeft = velocity < 0
  const visualX = movingLeft ? position - stretch : position
  const visualWidth = baseWidth + stretch
  const compression = Math.min(speed / SHUB_MOTION_PHYSICS.compressionVelocity, SHUB_MOTION_PHYSICS.maxCompression)
  return {
    speed,
    stretch,
    movingRight,
    movingLeft,
    direction: movingRight ? 'right' : movingLeft ? 'left' : 'still',
    visualX,
    visualWidth,
    compression,
    radius: Math.max(minRadius, baseRadius - stretch * 0.08),
  }
}

export function getSHubReactionFromVelocity(velocity, scale = 1) {
  const impulse = Math.min(Math.abs(velocity) * SHUB_MOTION_PHYSICS.stretchPerVelocity * scale, 7.5)
  const direction = velocity > 0 ? 1 : velocity < 0 ? -1 : 0
  return { impulse, direction }
}
