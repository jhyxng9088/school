const PHYSICAL_CLASS_COUPLING_CSS = `
/* Preview-only physical class coupling.
   One continuous hierarchy: nav shell -> active middle pill -> expanded class station -> nested pill.
   The nested pill's real spring frames directly deform the expanded middle pill. */
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
  transform: translate3d(calc(-50% + var(--class-physical-content-shift-x, 0px)), 0, 0) !important;
  opacity: var(--class-overlay-opacity, 0) !important;
}

.bottom-nav[data-class-layout-spring="true"] .class-nav-mini-pill {
  background: var(--surface-glass) !important;
  border: 0 !important;
  box-shadow: inset 0 0 0 0.5px var(--border), 0 2px 8px rgba(0,0,0,.08) !important;
}

/* The class icon comes back from the same collapse progress instead of waiting on a timer. */
.bottom-nav[data-class-layout-spring="true"].is-class-collapsing .nav-button[data-tab="class"] {
  opacity: var(--class-return-opacity, 0) !important;
  pointer-events: none !important;
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

  /* Scope all force coupling strictly to the smallest pill. It continuously re-measures
     its parent while the class station is opening/closing, so its first visible frame
     can never keep the narrow pre-expansion width. */
  next = replaceBlockRequired(
    next,
    'function useStationLikePillSpring(activeIndex, enabled) {',
    'function useClassStationLayoutSpring(navRef, expanded) {',
    (block) => {
      let nested = block

      nested = replaceRequired(
        nested,
        `      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'\n    }`,
        `      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'\n\n      const containerWidth = container.clientWidth || 1\n      const visualCenter = visualX + visualWidth / 2\n      const normalizedCenter = Math.max(-1, Math.min(1, ((visualCenter / containerWidth) - 0.5) * 2))\n      const leadingEnergy = Math.min(stretch, S_HUB_STATION_PHYSICS.maxStretch)\n      const physicalShift = (movingRight ? 1 : movingLeft ? -1 : 0) * Math.min(5.6, leadingEnergy * 0.36)\n      const physicalScaleX = 1 + Math.min(0.035, leadingEnergy / 520)\n      const physicalScaleY = 1 - Math.min(0.012, leadingEnergy / 1500)\n      const contentShift = physicalShift * 0.34\n      const host = container.closest('.bottom-nav')\n      if (host) {\n        host.style.setProperty('--class-physical-shift-x', physicalShift.toFixed(3) + 'px')\n        host.style.setProperty('--class-physical-content-shift-x', contentShift.toFixed(3) + 'px')\n        host.style.setProperty('--class-physical-scale-x', physicalScaleX.toFixed(5))\n        host.style.setProperty('--class-physical-scale-y', physicalScaleY.toFixed(5))\n        host.style.setProperty('--class-physical-origin-x', movingRight ? '0%' : movingLeft ? '100%' : '50%')\n        host.dispatchEvent(new CustomEvent('classminiphysics', {\n          detail: {\n            x: physics.x,\n            targetX: physics.targetX,\n            velocity: physics.velocity,\n            stretch,\n            visualX,\n            visualWidth,\n            normalizedCenter,\n            shiftX: physicalShift,\n            contentShiftX: contentShift,\n            scaleX: physicalScaleX,\n            scaleY: physicalScaleY,\n          },\n        }))\n      }\n    }`,
        'nested pill frame coupling',
      )

      nested = replaceRequired(
        nested,
        `        physics.frame = null\n        paint()\n        return\n      }\n\n      physics.frame = requestAnimationFrame(animate)`,
        `        physics.frame = null\n        paint()\n        const settledHost = container.closest('.bottom-nav')\n        if (settledHost) {\n          settledHost.style.setProperty('--class-physical-shift-x', '0px')\n          settledHost.style.setProperty('--class-physical-content-shift-x', '0px')\n          settledHost.style.setProperty('--class-physical-scale-x', '1')\n          settledHost.style.setProperty('--class-physical-scale-y', '1')\n          settledHost.style.setProperty('--class-physical-origin-x', '50%')\n        }\n        return\n      }\n\n      physics.frame = requestAnimationFrame(animate)`,
        'nested pill physical rest',
      )

      nested = replaceRequired(
        nested,
        `    const handleResize = () => {\n      stopAnimation()\n      physics.lastTime = 0\n      measure(true)\n    }\n    window.addEventListener('resize', handleResize)\n    window.addEventListener('orientationchange', handleResize)\n\n    return () => {\n      stopAnimation()\n      window.removeEventListener('resize', handleResize)\n      window.removeEventListener('orientationchange', handleResize)\n    }`,
        `    const stationHost = container.closest('.bottom-nav')\n\n    const syncWithParentStation = () => {\n      const movingTarget = buttonRefs.current[activeIndex]\n      if (!movingTarget) return\n      const containerRect = container.getBoundingClientRect()\n      const buttonRect = movingTarget.getBoundingClientRect()\n      physics.targetX = buttonRect.left - containerRect.left\n      physics.baseWidth = buttonRect.width\n\n      if (reduceMotion) {\n        physics.x = physics.targetX\n        physics.velocity = 0\n        paint()\n        return\n      }\n\n      /* Width is geometry, not a second animation. Repaint every parent spring frame so\n         the nested pill grows continuously with the station even when x does not move. */\n      paint()\n      if (physics.frame === null && Math.abs(physics.x - physics.targetX) > 0.01) {\n        physics.lastTime = 0\n        physics.frame = requestAnimationFrame(animate)\n      }\n    }\n\n    const handleResize = () => {\n      stopAnimation()\n      physics.lastTime = 0\n      measure(true)\n    }\n    stationHost?.addEventListener('stationlayout', syncWithParentStation)\n    window.addEventListener('resize', handleResize)\n    window.addEventListener('orientationchange', handleResize)\n\n    return () => {\n      stopAnimation()\n      stationHost?.removeEventListener('stationlayout', syncWithParentStation)\n      if (stationHost) {\n        stationHost.style.setProperty('--class-physical-shift-x', '0px')\n        stationHost.style.setProperty('--class-physical-content-shift-x', '0px')\n        stationHost.style.setProperty('--class-physical-scale-x', '1')\n        stationHost.style.setProperty('--class-physical-scale-y', '1')\n        stationHost.style.setProperty('--class-physical-origin-x', '50%')\n      }\n      window.removeEventListener('resize', handleResize)\n      window.removeEventListener('orientationchange', handleResize)\n    }`,
        'nested pill follows parent station geometry',
      )
      return nested
    },
    'smallest pill spring',
  )

  /* Drive overlay visibility and the returning class icon from the exact same width spring. */
  next = replaceBlockRequired(
    next,
    'function useClassStationLayoutSpring(navRef, expanded) {',
    'function useClassNestedReactionSpring(navRef, section, enabled) {',
    (block) => {
      let layout = block

      layout = replaceRequired(
        layout,
        `      nav.style.setProperty('--station-item-scale-y', (1 - compression).toFixed(5))\n      nav.dispatchEvent(new Event('stationlayout'))`,
        `      nav.style.setProperty('--station-item-scale-y', (1 - compression).toFixed(5))\n      const classProgress = Math.max(0, Math.min(1, physics.progress))\n      const overlayOpacity = Math.max(0, Math.min(1, (classProgress - 0.34) / 0.45))\n      const classReturnOpacity = Math.max(0, Math.min(1, (0.38 - classProgress) / 0.26))\n      nav.style.setProperty('--class-progress', classProgress.toFixed(5))\n      nav.style.setProperty('--class-overlay-opacity', overlayOpacity.toFixed(5))\n      nav.style.setProperty('--class-return-opacity', classReturnOpacity.toFixed(5))\n      nav.dispatchEvent(new Event('stationlayout'))`,
        'class generation and return progress',
      )

      layout = replaceRequired(
        layout,
        `    padding: 5,\n  })`,
        `    padding: 5,\n    exitHandoffSent: false,\n  })`,
        'class exit handoff state',
      )

      layout = replaceRequired(
        layout,
        `    nav.dataset.classLayoutSpring = 'true'\n    physics.target = expanded ? 1 : 0`,
        `    nav.dataset.classLayoutSpring = 'true'\n    physics.target = expanded ? 1 : 0\n    physics.exitHandoffSent = false`,
        'reset class exit handoff',
      )

      layout = replaceRequired(
        layout,
        `      physics.velocity += acceleration * dt\n      physics.progress += physics.velocity * dt\n      paint()\n\n      const settled =`,
        `      physics.velocity += acceleration * dt\n      physics.progress += physics.velocity * dt\n      paint()\n\n      if (physics.target === 0 && !physics.exitHandoffSent && physics.progress <= 0.18) {\n        physics.exitHandoffSent = true\n        nav.dispatchEvent(new CustomEvent('classlayoutexithandoff', {\n          detail: { progress: physics.progress, velocity: physics.velocity },\n        }))\n      }\n\n      const settled =`,
        'physical class exit handoff',
      )

      layout = replaceRequired(
        layout,
        `      physics.velocity = 0\n      paint()\n    } else {`,
        `      physics.velocity = 0\n      paint()\n      if (reduceMotion && physics.target === 0) {\n        physics.exitHandoffSent = true\n        queueMicrotask(() => nav.dispatchEvent(new CustomEvent('classlayoutexithandoff', {\n          detail: { progress: physics.progress, velocity: 0 },\n        })))\n      }\n    } else {`,
        'reduced-motion class exit handoff',
      )

      return layout
    },
    'class width spring',
  )

  /* Replace the arbitrary 180ms + 500ms exit timing with a handoff from the real collapse spring. */
  next = replaceRequired(
    next,
    `  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n    if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n  }, [])`,
    `  useEffect(() => () => {\n    if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n    if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n  }, [])\n\n  useEffect(() => {\n    const nav = navRef.current\n    if (!nav) return undefined\n\n    const handleClassExitHandoff = () => {\n      const target = classExitTargetRef.current\n      if (!target) return\n      if (classExitTimerRef.current) {\n        window.clearTimeout(classExitTimerRef.current)\n        classExitTimerRef.current = 0\n      }\n      classExitTargetRef.current = ''\n      commitStationTab(target)\n      setClassNavCollapsing(false)\n    }\n\n    nav.addEventListener('classlayoutexithandoff', handleClassExitHandoff)\n    return () => nav.removeEventListener('classlayoutexithandoff', handleClassExitHandoff)\n  }, [navRef])`,
    'event-driven class exit handoff',
  )

  next = replaceRequired(
    next,
    `      if (nextTab === 'class' && classExitTimerRef.current) {\n        window.clearTimeout(classExitTimerRef.current)\n        classExitTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        setClassNavExpanded(true)\n      }`,
    `      if (nextTab === 'class' && (classNavCollapsing || classExitTargetRef.current || classExitTimerRef.current)) {\n        if (classExitTimerRef.current) window.clearTimeout(classExitTimerRef.current)\n        classExitTimerRef.current = 0\n        classExitTargetRef.current = ''\n        setClassNavCollapsing(false)\n        setClassNavExpanded(true)\n      }`,
    'cancel physical class exit',
  )

  next = replaceRequired(
    next,
    `      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        classExitTargetRef.current = ''\n        if (target) commitStationTab(target)\n        classExitTimerRef.current = 0\n        if (classExitReleaseTimerRef.current) window.clearTimeout(classExitReleaseTimerRef.current)\n        classExitReleaseTimerRef.current = window.setTimeout(() => {\n          classExitReleaseTimerRef.current = 0\n          setClassNavCollapsing(false)\n        }, 500)\n      }, 180)`,
    `      classExitTimerRef.current = window.setTimeout(() => {\n        const target = classExitTargetRef.current\n        if (!target) return\n        classExitTargetRef.current = ''\n        classExitTimerRef.current = 0\n        commitStationTab(target)\n        setClassNavCollapsing(false)\n      }, 900)`,
    'spring-driven exit with safety fallback',
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
