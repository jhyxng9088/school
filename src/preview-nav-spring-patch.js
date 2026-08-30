export const PREVIEW_NAV_SPRING = Object.freeze({
  stiffness: 56,
  damping: 10.5,
  mass: 1,
})

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Preview nav spring ${label} marker changed unexpectedly`)
  }
  return source.replace(from, to)
}

export function patchPreviewNavSpringSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.includes('/src/') || !cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')

  const mobileGuard = [
    '    const compatibilityMotion = MOBILE_BROWSER_COMPAT',
    '    if (compatibilityMotion) {',
    '      stopInlineIndicatorStyles(indicator)',
    '      return undefined',
    '    }',
  ].join('\n')
  const universalSpringSetup = [
    "    indicator.dataset.springMotion = 'true'",
    "    indicator.style.setProperty('left', '0px', 'important')",
    "    indicator.style.setProperty('transition', 'none', 'important')",
  ].join('\n')
  next = replaceRequired(next, mobileGuard, universalSpringSetup, 'mobile guard')

  next = replaceRequired(
    next,
    '      indicator.style.transform = `translate3d(${visualX}px, 0, 0) scaleY(${1 - compression})`',
    "      indicator.style.setProperty('transform', `translate3d(${visualX}px, 0, 0) scaleY(${1 - compression})`, 'important')",
    'transform paint',
  )
  next = replaceRequired(
    next,
    '      indicator.style.borderRadius = `${Math.max(16, 20 - stretch * 0.08)}px`',
    "      indicator.style.setProperty('border-radius', `${Math.max(16, 20 - stretch * 0.08)}px`, 'important')",
    'radius paint',
  )

  const physicsMarker = [
    '      const stiffness = 50',
    '      const damping = 10',
    '      const mass = 1',
  ].join('\n')
  const previewPhysics = [
    `      const stiffness = ${PREVIEW_NAV_SPRING.stiffness}`,
    `      const damping = ${PREVIEW_NAV_SPRING.damping}`,
    `      const mass = ${PREVIEW_NAV_SPRING.mass}`,
  ].join('\n')
  next = replaceRequired(next, physicsMarker, previewPhysics, 'physics')

  return next
}
