export const PREVIEW_NAV_SPRING = Object.freeze({
  stiffness: 56,
  damping: 10.5,
  mass: 1,
})

const ELASTIC_SHELL_CSS = `
/* Preview-only elastic nav shell: the visual shell expands with edge stretch
   while the actual nav/button layout stays fixed. */
.bottom-nav[data-elastic-shell="true"] {
  overflow: visible;
  contain: layout;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.bottom-nav[data-elastic-shell="true"]::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--surface-glass);
  box-shadow: var(--shadow-nav);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  pointer-events: none;
  transform: translate3d(var(--nav-shell-shift-x, 0px), 0, 0) scaleX(var(--nav-shell-scale-x, 1));
  transform-origin: 50% 50%;
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.bottom-nav[data-elastic-shell="true"] .nav-indicator {
  z-index: 1;
}

.bottom-nav[data-elastic-shell="true"] .nav-button {
  z-index: 2;
}

html.school-samsung .bottom-nav[data-elastic-shell="true"]::before {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
`

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Preview nav spring ${label} marker changed unexpectedly`)
  }
  return source.replace(from, to)
}

export function patchPreviewNavSpringSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.includes('/src/')) return String(source || '')

  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (!current.includes('.bottom-nav {') || !current.includes('.nav-indicator {')) {
      throw new Error('Preview nav spring stylesheet marker changed unexpectedly')
    }
    if (current.includes('data-elastic-shell="true"')) return current
    return `${current}\n${ELASTIC_SHELL_CSS}`
  }

  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

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
    "    nav.dataset.elasticShell = 'true'",
    "    nav.style.setProperty('--nav-shell-scale-x', '1')",
    "    nav.style.setProperty('--nav-shell-shift-x', '0px')",
    "    const navPadding = Number.parseFloat(window.getComputedStyle(nav).getPropertyValue('--nav-padding')) || 5",
    "    indicator.style.setProperty('left', '0px', 'important')",
    "    indicator.style.setProperty('transition', 'none', 'important')",
  ].join('\n')
  next = replaceRequired(next, mobileGuard, universalSpringSetup, 'mobile guard')

  const visualMarker = [
    '      const visualWidth = physics.baseWidth + stretch',
    '      const compression = Math.min(speed / 18000, 0.028)',
  ].join('\n')
  const elasticVisuals = [
    '      const visualWidth = physics.baseWidth + stretch',
    '      const compression = Math.min(speed / 18000, 0.028)',
    '      const visualRight = visualX + visualWidth',
    '      const leftShellStretch = Math.max(0, navPadding - visualX)',
    '      const rightShellStretch = Math.max(0, visualRight - (nav.clientWidth - navPadding))',
    '      const shellScaleX = (nav.clientWidth + leftShellStretch + rightShellStretch) / nav.clientWidth',
    '      const shellShiftX = (rightShellStretch - leftShellStretch) / 2',
    "      nav.style.setProperty('--nav-shell-scale-x', shellScaleX.toFixed(5))",
    "      nav.style.setProperty('--nav-shell-shift-x', `${shellShiftX}px`)",
  ].join('\n')
  next = replaceRequired(next, visualMarker, elasticVisuals, 'elastic shell geometry')

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
