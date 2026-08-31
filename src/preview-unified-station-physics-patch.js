export const UNIVERSAL_STATION_PHYSICS = Object.freeze({
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
  settleDistanceNormalized: 0.0008,
  settleVelocityNormalized: 0.0008,
})

const RUNTIME_CONTRACT = `
/* Preview-only universal station motion contract.
   Every bottom-nav pill/station keeps its own geometry, but shares this exact motion law. */
const S_HUB_STATION_PHYSICS = Object.freeze({
  stiffness: ${UNIVERSAL_STATION_PHYSICS.stiffness},
  damping: ${UNIVERSAL_STATION_PHYSICS.damping},
  mass: ${UNIVERSAL_STATION_PHYSICS.mass},
  maxDt: ${UNIVERSAL_STATION_PHYSICS.maxDt},
  stretchPerVelocity: ${UNIVERSAL_STATION_PHYSICS.stretchPerVelocity},
  maxStretch: ${UNIVERSAL_STATION_PHYSICS.maxStretch},
  compressionVelocity: ${UNIVERSAL_STATION_PHYSICS.compressionVelocity},
  maxCompression: ${UNIVERSAL_STATION_PHYSICS.maxCompression},
  radiusShrinkPerStretch: ${UNIVERSAL_STATION_PHYSICS.radiusShrinkPerStretch},
  settleDistancePx: ${UNIVERSAL_STATION_PHYSICS.settleDistancePx},
  settleVelocityPx: ${UNIVERSAL_STATION_PHYSICS.settleVelocityPx},
  settleDistanceNormalized: ${UNIVERSAL_STATION_PHYSICS.settleDistanceNormalized},
  settleVelocityNormalized: ${UNIVERSAL_STATION_PHYSICS.settleVelocityNormalized},
})
`

function replaceAllRequired(source, marker, replacement, expectedCount, label) {
  const count = String(source || '').split(marker).length - 1
  if (count !== expectedCount) {
    throw new Error(`Universal station physics marker mismatch: ${label} (expected ${expectedCount}, got ${count})`)
  }
  return source.split(marker).join(replacement)
}

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Universal station physics marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function patchMainSource(source) {
  let next = String(source || '')

  if (!next.includes('S_HUB_STATION_PHYSICS = Object.freeze')) {
    next = replaceRequired(
      next,
      'function useNavSpring(activeIndex) {',
      `${RUNTIME_CONTRACT}\nfunction useNavSpring(activeIndex) {`,
      'runtime contract insertion',
    )
  }

  next = replaceAllRequired(
    next,
    'const stiffness = 56',
    'const stiffness = S_HUB_STATION_PHYSICS.stiffness',
    4,
    'shared stiffness',
  )
  next = replaceAllRequired(
    next,
    'const damping = 10.5',
    'const damping = S_HUB_STATION_PHYSICS.damping',
    4,
    'shared damping',
  )
  next = replaceAllRequired(
    next,
    'const mass = 1',
    'const mass = S_HUB_STATION_PHYSICS.mass',
    4,
    'shared mass',
  )
  next = replaceAllRequired(
    next,
    'Math.min((time - physics.lastTime) / 1000, 0.032)',
    'Math.min((time - physics.lastTime) / 1000, S_HUB_STATION_PHYSICS.maxDt)',
    4,
    'shared frame clamp',
  )
  next = replaceAllRequired(
    next,
    'Math.min(speed * 0.032, 18)',
    'Math.min(speed * S_HUB_STATION_PHYSICS.stretchPerVelocity, S_HUB_STATION_PHYSICS.maxStretch)',
    3,
    'shared directional stretch',
  )
  next = replaceAllRequired(
    next,
    'Math.min(speed / 18000, 0.028)',
    'Math.min(speed / S_HUB_STATION_PHYSICS.compressionVelocity, S_HUB_STATION_PHYSICS.maxCompression)',
    3,
    'shared vertical compression',
  )
  next = replaceAllRequired(
    next,
    'stretch * 0.08',
    'stretch * S_HUB_STATION_PHYSICS.radiusShrinkPerStretch',
    2,
    'shared radius reaction',
  )
  next = replaceAllRequired(
    next,
    'Math.abs(physics.x - physics.targetX) < 0.06 && Math.abs(physics.velocity) < 0.06',
    'Math.abs(physics.x - physics.targetX) < S_HUB_STATION_PHYSICS.settleDistancePx && Math.abs(physics.velocity) < S_HUB_STATION_PHYSICS.settleVelocityPx',
    2,
    'shared pixel settle threshold',
  )
  next = replaceAllRequired(
    next,
    'Math.abs(physics.progress - physics.target) < 0.0008 && Math.abs(physics.velocity) < 0.0008',
    'Math.abs(physics.progress - physics.target) < S_HUB_STATION_PHYSICS.settleDistanceNormalized && Math.abs(physics.velocity) < S_HUB_STATION_PHYSICS.settleVelocityNormalized',
    1,
    'shared normalized layout settle threshold',
  )
  next = replaceAllRequired(
    next,
    'Math.abs(physics.x - physics.target) < 0.0008 && Math.abs(physics.velocity) < 0.0008',
    'Math.abs(physics.x - physics.target) < S_HUB_STATION_PHYSICS.settleDistanceNormalized && Math.abs(physics.velocity) < S_HUB_STATION_PHYSICS.settleVelocityNormalized',
    1,
    'shared normalized reaction settle threshold',
  )

  return next
}

export function patchPreviewUnifiedStationPhysicsSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
