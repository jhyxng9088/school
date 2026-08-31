const PHYSICAL_CLASS_COUPLING_CSS = `
/* Preview-only physical class coupling.
   The top-level nav indicator remains the one visible middle pill.
   The class capsule is content-only; the nested pill directly deforms the same middle pill skin. */
.bottom-nav[data-class-layout-spring="true"] .nav-indicator {
  overflow: visible;
  background: transparent !important;
  box-shadow: none !important;
}

.bottom-nav[data-class-layout-spring="true"] .nav-indicator::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 0.5px solid var(--border);
  border-radius: inherit;
  background: var(--surface-glass);
  box-shadow: inset 0 0 0 0.5px var(--border), 0 5px 18px rgba(0,0,0,.10);
  pointer-events: none;
  transform:
    translate3d(var(--class-physical-shift-x, 0px), 0, 0)
    scaleX(var(--class-physical-scale-x, 1))
    scaleY(var(--class-physical-scale-y, 1));
  transform-origin: var(--class-physical-origin-x, 50%) 58%;
  will-change: transform;
}

.bottom-nav[data-class-layout-spring="true"].is-class-expanded .nav-indicator,
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .nav-indicator {
  opacity: 1 !important;
}

/* This overlay only contains the two class destinations. It is not a second outer pill. */
.bottom-nav[data-class-layout-spring="true"] .class-nav-capsule,
.bottom-nav[data-class-layout-spring="true"].is-class-expanded .class-nav-capsule,
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .class-nav-capsule {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  transform: translate3d(-50%, 0, 0) !important;
  opacity: var(--class-overlay-opacity, 0) !important;
}

.bottom-nav[data-class-layout-spring="true"] .class-nav-mini-pill {
  background: var(--surface-glass) !important;
  border: 0 !important;
  box-shadow: inset 0 0 0 0.5px var(--border), 0 2px 8px rgba(0,0,0,.08) !important;
}

/* Remove the old imitation reaction: neighboring stations no longer get independent pushes. */
.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="home"],
.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="ai"],
.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="study"],
.bottom-nav[data-class-layout-spring="true"] .nav-button[data-tab="schedule"] {
  transform:
    scaleX(var(--station-item-scale-x, 1))
    scaleY(var(--station-item-scale-y, 1)) !important;
}

html.school-samsung .bottom-nav[data-class-layout-spring="true"] .nav-indicator::after {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

@media (prefers-reduced-motion: reduce) {
  .bottom-nav[data-class-layout-spring="true"] .nav-indicator::after {
    transform: none !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Physical class coupling marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function replaceBlockRequired(source, startMarker, endMarker, transform, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Physical class coupling range missing: ${label}`)
  const current = source.slice(start, end)
  const next = transform(current)
  return `${source.slice(0, start)}${next}${source.slice(end)}`
}

function patchMainSource(source) {
  let next = String(source || '')

  /* The old nested spring made a separate fake shell reaction. Keep its helper inert,
     but remove the hook so only real nested-pill frames drive the outer middle pill. */
  next = replaceRequired(
    next,
    `  useClassNestedReactionSpring(navRef, classSection, classNavExpanded || classNavCollapsing)\n`,
    ``,
    'remove imitation reaction hook',
  )

  /* Scope the coupling strictly to the smallest pill. The main top-level spring must never
     receive these nested-only force calculations. */
  next = replaceBlockRequired(
    next,
    'function useStationLikePillSpring(activeIndex, enabled) {',
    'function useClassStationLayoutSpring(navRef, expanded) {',
    (block) => {
      let nested = block
      nested = replaceRequired(
        nested,
        `      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'\n    }`,
        `      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'\n\n      const containerWidth = container.clientWidth || 1\n      const visualCenter = visualX + visualWidth / 2\n      const normalizedCenter = Math.max(-1, Math.min(1, ((visualCenter / containerWidth) - 0.5) * 2))\n      const leadingEnergy = Math.min(stretch, S_HUB_STATION_PHYSICS.maxStretch)\n      const physicalShift = (movingRight ? 1 : movingLeft ? -1 : 0) * Math.min(3.2, leadingEnergy * 0.18)\n      const physicalScaleX = 1 + Math.min(0.024, leadingEnergy / 750)\n      const physicalScaleY = 1 - Math.min(0.010, leadingEnergy / 1800)\n      const host = container.closest('.bottom-nav')\n      if (host) {\n        host.style.setProperty('--class-physical-shift-x', physicalShift.toFixed(3) + 'px')\n        host.style.setProperty('--class-physical-scale-x', physicalScaleX.toFixed(5))\n        host.style.setProperty('--class-physical-scale-y', physicalScaleY.toFixed(5))\n        host.style.setProperty('--class-physical-origin-x', movingRight ? '0%' : movingLeft ? '100%' : '50%')\n        host.dispatchEvent(new CustomEvent('classminiphysics', {\n          detail: {\n            x: physics.x,\n            targetX: physics.targetX,\n            velocity: physics.velocity,\n            stretch,\n            visualX,\n            visualWidth,\n            normalizedCenter,\n            shiftX: physicalShift,\n            scaleX: physicalScaleX,\n            scaleY: physicalScaleY,\n          },\n        }))\n      }\n    }`,
        'nested pill frame coupling',
      )

      nested = replaceRequired(
        nested,
        `        physics.frame = null\n        paint()\n        return\n      }\n\n      physics.frame = requestAnimationFrame(animate)`,
        `        physics.frame = null\n        paint()\n        const settledHost = container.closest('.bottom-nav')\n        if (settledHost) {\n          settledHost.style.setProperty('--class-physical-shift-x', '0px')\n          settledHost.style.setProperty('--class-physical-scale-x', '1')\n          settledHost.style.setProperty('--class-physical-scale-y', '1')\n          settledHost.style.setProperty('--class-physical-origin-x', '50%')\n        }\n        return\n      }\n\n      physics.frame = requestAnimationFrame(animate)`,
        'nested pill physical rest',
      )
      return nested
    },
    'smallest pill spring',
  )

  next = replaceBlockRequired(
    next,
    'function useClassStationLayoutSpring(navRef, expanded) {',
    'function useClassNestedReactionSpring(navRef, section, enabled) {',
    (block) => replaceRequired(
      block,
      `      nav.style.setProperty('--station-item-scale-y', (1 - compression).toFixed(5))\n      nav.dispatchEvent(new Event('stationlayout'))`,
      `      nav.style.setProperty('--station-item-scale-y', (1 - compression).toFixed(5))\n      const classProgress = Math.max(0, Math.min(1, physics.progress))\n      const overlayOpacity = Math.max(0, Math.min(1, (classProgress - 0.34) / 0.45))\n      nav.style.setProperty('--class-progress', classProgress.toFixed(5))\n      nav.style.setProperty('--class-overlay-opacity', overlayOpacity.toFixed(5))\n      nav.dispatchEvent(new Event('stationlayout'))`,
      'class generation progress',
    ),
    'class width spring',
  )

  return next
}

export function patchPreviewPhysicalClassCouplingSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only physical class coupling.')) return current
    return `${current}\n${PHYSICAL_CLASS_COUPLING_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
