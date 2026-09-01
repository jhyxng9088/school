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
function useNestedGeometryCoupling(navRef, enabled, ownsIndicator) {
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || !enabled) return undefined

    const inset = 5
    let lastDetail = null
    let baseClassWidth = 0
    let baseSideWidth = 0
    let lastGeometryKey = ''

    nav.dataset.nestedGeometryFollow = 'true'

    function readBaseGeometry() {
      const nextClassWidth = Number.parseFloat(nav.style.getPropertyValue('--station-class-current'))
      const nextSideWidth = Number.parseFloat(nav.style.getPropertyValue('--station-side-current'))
      if (Number.isFinite(nextClassWidth)) baseClassWidth = nextClassWidth
      if (Number.isFinite(nextSideWidth)) baseSideWidth = nextSideWidth
    }

    function syncOuterIndicatorNow(actualLeftWidth, actualClassWidth) {
      if (!ownsIndicator) return
      const indicator = nav.querySelector('.nav-indicator')
      if (!indicator) return
      const x = inset + actualLeftWidth
      indicator.style.setProperty('width', actualClassWidth + 'px', 'important')
      indicator.style.setProperty('transform', 'translate3d(' + x + 'px, 0, 0) scaleY(1)', 'important')
      indicator.style.setProperty('border-radius', '19px', 'important')
      indicator.dataset.direction = 'still'
    }

    function applyGeometry(detail = lastDetail) {
      if (!Number.isFinite(baseClassWidth) || baseClassWidth <= 0 || !Number.isFinite(baseSideWidth) || baseSideWidth <= 0) {
        readBaseGeometry()
      }
      if (!Number.isFinite(baseClassWidth) || baseClassWidth <= 0 || !Number.isFinite(baseSideWidth) || baseSideWidth <= 0) return

      let leftExtension = 0
      let rightExtension = 0
      if (detail) {
        const visualX = Number(detail.visualX)
        const visualWidth = Number(detail.visualWidth)
        if (Number.isFinite(visualX) && Number.isFinite(visualWidth)) {
          const visualRight = visualX + visualWidth
          leftExtension = Math.max(0, inset - visualX)
          rightExtension = Math.max(0, visualRight - (baseClassWidth - inset))
        }
      }

      const maxExtension = S_HUB_STATION_PHYSICS.maxStretch
      leftExtension = Math.min(maxExtension, leftExtension)
      rightExtension = Math.min(maxExtension, rightExtension)

      const actualClassWidth = baseClassWidth + leftExtension + rightExtension
      const actualLeftWidth = Math.max(0, baseSideWidth - leftExtension)
      const actualRightWidth = Math.max(0, baseSideWidth - rightExtension / 3)
      const geometryKey = [
        baseClassWidth,
        baseSideWidth,
        leftExtension,
        rightExtension,
      ].map((value) => value.toFixed(3)).join('|')

      if (geometryKey !== lastGeometryKey) {
        lastGeometryKey = geometryKey
        nav.style.setProperty('--nested-shell-inset', inset + 'px')
        nav.style.setProperty('--nested-left-extension', leftExtension.toFixed(3) + 'px')
        nav.style.setProperty('--nested-right-extension', rightExtension.toFixed(3) + 'px')
        nav.style.setProperty('--station-left-actual', actualLeftWidth.toFixed(3) + 'px')
        nav.style.setProperty('--station-class-actual', actualClassWidth.toFixed(3) + 'px')
        nav.style.setProperty('--station-right-actual', actualRightWidth.toFixed(3) + 'px')
      }

      syncOuterIndicatorNow(actualLeftWidth, actualClassWidth)
    }

    function handleMiniPhysics(event) {
      lastDetail = event.detail || null
      applyGeometry(lastDetail)
    }

    function handleBaseLayout() {
      readBaseGeometry()
      applyGeometry(lastDetail)
    }

    nav.addEventListener('classminiphysics', handleMiniPhysics)
    nav.addEventListener('stationlayout', handleBaseLayout)
    readBaseGeometry()
    applyGeometry(null)

    return () => {
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
  }, [navRef, enabled, ownsIndicator])
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
    `  useClassStationLayoutSpring(navRef, classNavExpanded)\n  useNestedGeometryCoupling(navRef, classNavExpanded || classNavCollapsing, activeTab === 'class')\n  useClassCollapseSettledGuard(navRef, classNavCollapsing, setClassNavCollapsing, classExitReleaseTimerRef)`,
    'geometry hook hookup',
  )

  /* When the class station owns the indicator, derive its x/width from the same inline
     geometry values that paint the grid. This avoids forced layout reads on every frame. */
  next = replaceRequired(
    next,
    `    const handleStationLayoutFrame = () => {\n      const movingTarget = buttonRefs.current[activeIndex]\n      if (!movingTarget) return\n      const navRect = nav.getBoundingClientRect()\n      const buttonRect = movingTarget.getBoundingClientRect()\n      physics.targetX = buttonRect.left - navRect.left\n      physics.baseWidth = buttonRect.width\n      if (reduceMotion) {`,
    `    const handleStationLayoutFrame = () => {\n      const movingTarget = buttonRefs.current[activeIndex]\n      if (!movingTarget) return\n      const directNestedGeometryFollow = nav.dataset.nestedGeometryFollow === 'true' && activeIndex === 1\n      if (directNestedGeometryFollow) {\n        const classWidth = Number.parseFloat(nav.style.getPropertyValue('--station-class-actual')) || Number.parseFloat(nav.style.getPropertyValue('--station-class-current'))\n        const leftWidth = Number.parseFloat(nav.style.getPropertyValue('--station-left-actual')) || Number.parseFloat(nav.style.getPropertyValue('--station-side-current'))\n        if (Number.isFinite(classWidth) && Number.isFinite(leftWidth)) {\n          stopAnimation()\n          physics.targetX = 5 + leftWidth\n          physics.baseWidth = classWidth\n          physics.x = physics.targetX\n          physics.velocity = 0\n          physics.lastTime = 0\n          paint()\n          return\n        }\n      }\n      const navRect = nav.getBoundingClientRect()\n      const buttonRect = movingTarget.getBoundingClientRect()\n      physics.targetX = buttonRect.left - navRect.left\n      physics.baseWidth = buttonRect.width\n      if (reduceMotion) {`,
    'main indicator uses cached nested geometry',
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
