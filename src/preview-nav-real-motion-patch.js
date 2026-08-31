const REAL_NAV_MOTION_CSS = `
/* Preview-only real continuous nav motion.
   The nested class controls are physically attached to the one moving main pill. */
.bottom-nav[data-class-layout-spring="true"].is-class-expanded .class-nav-capsule,
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .class-nav-capsule {
  left: var(--main-pill-visual-center-x, var(--class-capsule-center)) !important;
  width: var(--main-pill-visual-width, var(--station-class-current)) !important;
  transform: translate3d(-50%, 0, 0) !important;
  padding: 5px !important;
  overflow: visible !important;
}

.bottom-nav[data-class-layout-spring="true"] .class-nav-mini-pill {
  top: 5px !important;
  bottom: 5px !important;
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview real nav motion marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function replaceBlockRequired(source, startMarker, endMarker, transform, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview real nav motion block missing: ${label}`)
  const current = source.slice(start, end)
  return `${source.slice(0, start)}${transform(current)}${source.slice(end)}`
}

function patchMainSource(source) {
  let next = String(source || '')

  /* Publish the real main-pill frame. Nested class controls consume this exact visual frame,
     so there is no separately positioned imitation shell. */
  next = replaceBlockRequired(
    next,
    'function useNavSpring(activeIndex) {',
    'function useStationLikePillSpring(activeIndex, enabled) {',
    (block) => replaceRequired(
      block,
      `      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'`,
      `      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'\n      nav.style.setProperty('--main-pill-visual-x', visualX.toFixed(3) + 'px')\n      nav.style.setProperty('--main-pill-visual-width', visualWidth.toFixed(3) + 'px')\n      nav.style.setProperty('--main-pill-visual-center-x', (visualX + visualWidth / 2).toFixed(3) + 'px')`,
      'publish main pill visual frame',
    ),
    'main spring',
  )

  /* The stability layer accidentally snapped class ownership to targetX. The main spring must
     always integrate toward the moving target; only reduced-motion may place it immediately. */
  next = replaceRequired(
    next,
    `        const directClassOwner = nav.dataset.nestedGeometryFollow === 'true' && activeIndex === 1\n        if (directClassOwner || reduceMotion) {\n          stopAnimation()\n          physics.x = physics.targetX\n          physics.velocity = 0\n          physics.lastTime = 0\n          paint()\n          return\n        }`,
    `        if (reduceMotion) {\n          stopAnimation()\n          physics.x = physics.targetX\n          physics.velocity = 0\n          physics.lastTime = 0\n          paint()\n          return\n        }`,
    'remove class target snap',
  )

  /* Nested geometry may change the class grid target, but it must never directly paint the
     main indicator. Its target is consumed by the same useNavSpring integrator instead. */
  next = replaceRequired(
    next,
    `      syncOuterIndicatorNow(actualLeftWidth, actualClassWidth)`,
    `      /* Main indicator paint is owned exclusively by useNavSpring. */`,
    'remove direct outer indicator paint',
  )

  /* The smallest pill lives inside the current visual outer pill, not inside a second target
     capsule parked at the class destination. Its target width therefore follows the real pill. */
  next = replaceRequired(
    next,
    `      const baseClassWidth = Number.parseFloat(stationHost?.style.getPropertyValue('--station-class-current'))\n      if (!Number.isFinite(baseClassWidth) || baseClassWidth <= 10) return`,
    `      const visualOuterWidth = Number.parseFloat(stationHost?.style.getPropertyValue('--main-pill-visual-width'))\n      const targetClassWidth = Number.parseFloat(stationHost?.style.getPropertyValue('--station-class-current'))\n      const baseClassWidth = Number.isFinite(visualOuterWidth) && visualOuterWidth > 10 ? visualOuterWidth : targetClassWidth\n      if (!Number.isFinite(baseClassWidth) || baseClassWidth <= 10) return`,
    'nested target follows moving outer pill',
  )

  return next
}

export function patchPreviewNavRealMotionSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only real continuous nav motion.')) return current
    return `${current}\n${REAL_NAV_MOTION_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
