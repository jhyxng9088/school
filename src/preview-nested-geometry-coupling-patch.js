const NESTED_GEOMETRY_CSS = `
/* Preview-only real nested geometry coupling.
   The class shell and the smallest pill share the same 5px inset used by the main nav shell.
   Small-pill edge pressure changes real grid geometry instead of faking a shell transform. */
.bottom-nav[data-class-layout-spring="true"][data-nested-geometry-follow="true"] {
  grid-template-columns:
    var(--station-left-actual, var(--station-side-current))
    var(--station-class-actual, var(--station-class-current))
    var(--station-right-actual, var(--station-side-current))
    var(--station-right-actual, var(--station-side-current))
    var(--station-right-actual, var(--station-side-current)) !important;
}

/* The nested controls keep their baseline geometry while the visible class shell grows around them.
   That prevents a feedback loop where shell growth also moves the nested target farther away. */
.bottom-nav[data-class-layout-spring="true"][data-nested-geometry-follow="true"] .class-nav-capsule {
  left: var(--class-capsule-center) !important;
  width: var(--station-class-current) !important;
  padding: 5px !important;
  overflow: visible !important;
  transform: translate3d(-50%, 0, 0) !important;
}

.bottom-nav[data-class-layout-spring="true"][data-nested-geometry-follow="true"] .class-nav-mini-pill {
  top: 5px !important;
  bottom: 5px !important;
}

/* Final geometry owns the middle pill. Disable the older decorative reaction transform. */
.bottom-nav[data-class-layout-spring="true"][data-nested-geometry-follow="true"] .nav-indicator::after {
  transform: none !important;
  transform-origin: 50% 50% !important;
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Nested geometry coupling marker missing: ${label}`)
  return source.replace(marker, replacement)
}

const NESTED_GEOMETRY_HOOK = String.raw`
function useNestedGeometryCoupling(navRef, enabled) {
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || !enabled) return undefined

    const inset = 5
    let layoutFrame = 0
    let lastDetail = null
    let lastGeometryKey = ''

    nav.dataset.nestedGeometryFollow = 'true'

    function syncOuterIndicatorNow() {
      const indicator = nav.querySelector('.nav-indicator')
      const classButton = nav.querySelector('.nav-button[data-tab="class"]')
      if (!indicator || !classButton) return
      const navRect = nav.getBoundingClientRect()
      const buttonRect = classButton.getBoundingClientRect()
      const x = buttonRect.left - navRect.left
      indicator.style.setProperty('width', buttonRect.width + 'px', 'important')
      indicator.style.setProperty('transform', 'translate3d(' + x + 'px, 0, 0) scaleY(1)', 'important')
      indicator.style.setProperty('border-radius', '19px', 'important')
      indicator.dataset.direction = 'still'
    }

    function scheduleLayoutSync() {
      if (layoutFrame) return
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0
        nav.dispatchEvent(new Event('stationlayout'))
      })
    }

    function applyGeometry(detail = lastDetail) {
      const style = window.getComputedStyle(nav)
      const baseClassWidth = Number.parseFloat(style.getPropertyValue('--station-class-current'))
      const baseSideWidth = Number.parseFloat(style.getPropertyValue('--station-side-current'))
      const capsule = nav.querySelector('.class-nav-capsule')
      if (!Number.isFinite(baseClassWidth) || !Number.isFinite(baseSideWidth) || !capsule) return

      let leftExtension = 0
      let rightExtension = 0
      if (detail) {
        const visualX = Number(detail.visualX)
        const visualWidth = Number(detail.visualWidth)
        const capsuleWidth = capsule.clientWidth || baseClassWidth
        if (Number.isFinite(visualX) && Number.isFinite(visualWidth)) {
          const visualRight = visualX + visualWidth
          leftExtension = Math.max(0, inset - visualX)
          rightExtension = Math.max(0, visualRight - (capsuleWidth - inset))
        }
      }

      const maxExtension = S_HUB_STATION_PHYSICS.maxStretch
      leftExtension = Math.min(maxExtension, leftExtension)
      rightExtension = Math.min(maxExtension, rightExtension)

      const actualClassWidth = baseClassWidth + leftExtension + rightExtension
      const actualLeftWidth = Math.max(0, baseSideWidth - leftExtension)
      const actualRightWidth = Math.max(0, baseSideWidth - rightExtension / 3)

      nav.style.setProperty('--nested-shell-inset', inset + 'px')
      nav.style.setProperty('--nested-left-extension', leftExtension.toFixed(3) + 'px')
      nav.style.setProperty('--nested-right-extension', rightExtension.toFixed(3) + 'px')
      nav.style.setProperty('--station-left-actual', actualLeftWidth.toFixed(3) + 'px')
      nav.style.setProperty('--station-class-actual', actualClassWidth.toFixed(3) + 'px')
      nav.style.setProperty('--station-right-actual', actualRightWidth.toFixed(3) + 'px')

      const geometryKey = [
        baseClassWidth,
        baseSideWidth,
        leftExtension,
        rightExtension,
      ].map((value) => value.toFixed(3)).join('|')

      syncOuterIndicatorNow()
      if (geometryKey !== lastGeometryKey) {
        lastGeometryKey = geometryKey
        scheduleLayoutSync()
      }
    }

    function handleMiniPhysics(event) {
      lastDetail = event.detail || null
      applyGeometry(lastDetail)
    }

    function handleBaseLayout() {
      applyGeometry(lastDetail)
    }

    nav.addEventListener('classminiphysics', handleMiniPhysics)
    nav.addEventListener('stationlayout', handleBaseLayout)
    applyGeometry(null)

    return () => {
      if (layoutFrame) cancelAnimationFrame(layoutFrame)
      nav.removeEventListener('classminiphysics', handleMiniPhysics)
      nav.removeEventListener('stationlayout', handleBaseLayout)
      delete nav.dataset.nestedGeometryFollow
      nav.style.removeProperty('--nested-shell-inset')
      nav.style.removeProperty('--nested-left-extension')
      nav.style.removeProperty('--nested-right-extension')
      nav.style.removeProperty('--station-left-actual')
      nav.style.removeProperty('--station-class-actual')
      nav.style.removeProperty('--station-right-actual')
    }
  }, [navRef, enabled])
}
`

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `function AppShell({ profile }) {`,
    `${NESTED_GEOMETRY_HOOK}\nfunction AppShell({ profile }) {`,
    'geometry hook injection',
  )

  next = replaceRequired(
    next,
    `  useClassStationLayoutSpring(navRef, classNavExpanded)\n  useClassCollapseSettledGuard(navRef, classNavCollapsing, setClassNavCollapsing, classExitReleaseTimerRef)`,
    `  useClassStationLayoutSpring(navRef, classNavExpanded)\n  useNestedGeometryCoupling(navRef, classNavExpanded || classNavCollapsing)\n  useClassCollapseSettledGuard(navRef, classNavCollapsing, setClassNavCollapsing, classExitReleaseTimerRef)`,
    'geometry hook hookup',
  )

  /* While the nested geometry system owns the class station, the main indicator follows
     the real class grid bounds directly. The motion is still smooth because those bounds
     are produced by the existing spring; this removes a second lagging spring that could
     let the smallest pill overlap the class shell for a frame. */
  next = replaceRequired(
    next,
    `      physics.targetX = buttonRect.left - navRect.left\n      physics.baseWidth = buttonRect.width\n      if (reduceMotion) {`,
    `      physics.targetX = buttonRect.left - navRect.left\n      physics.baseWidth = buttonRect.width\n      const directNestedGeometryFollow = nav.dataset.nestedGeometryFollow === 'true' && activeIndex === 1\n      if (directNestedGeometryFollow) {\n        stopAnimation()\n        physics.x = physics.targetX\n        physics.velocity = 0\n        physics.lastTime = 0\n        paint()\n        return\n      }\n      if (reduceMotion) {`,
    'main indicator direct nested geometry follow',
  )

  return next
}

export function patchPreviewNestedGeometryCouplingSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only real nested geometry coupling.')) return current
    return `${current}\n${NESTED_GEOMETRY_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
