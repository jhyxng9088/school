export const PREVIEW_CLASS_SEGMENT_PHYSICS = Object.freeze({
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
})

const CLASS_TOP_SEGMENT_CSS = `
/* Preview-only replacement for the nested class station.
   The bottom nav remains a fixed five-station rail; class switching lives in a wide,
   thin segmented control at the top of the class page. */
.bottom-nav {
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
}

.bottom-nav .nav-indicator {
  opacity: 1 !important;
}

.bottom-nav .nav-button[data-tab="class"] {
  opacity: 1 !important;
  pointer-events: auto !important;
}

.class-nav-capsule {
  display: none !important;
}

.class-station-page {
  min-width: 0;
}

.class-top-segment {
  --segment-padding: 5px;
  position: relative;
  width: 100%;
  height: 46px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 2px 0 18px;
  padding: var(--segment-padding);
  overflow: visible;
  border: 0;
  border-radius: 18px;
  background: transparent;
  contain: layout;
  isolation: isolate;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.class-top-segment::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-glass);
  box-shadow: var(--shadow-nav);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  pointer-events: none;
  transform: translate3d(var(--segment-shell-shift-x, 0px), 0, 0) scaleX(var(--segment-shell-scale-x, 1));
  transform-origin: 50% 50%;
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.class-top-segment-pill {
  position: absolute;
  z-index: 1;
  top: var(--segment-padding);
  bottom: var(--segment-padding);
  left: 0;
  width: 0;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: inset 0 0 0 0.5px var(--border);
  pointer-events: none;
  will-change: transform, width;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.class-top-segment-button {
  position: relative;
  z-index: 2;
  min-width: 0;
  min-height: 36px;
  display: grid;
  place-items: center;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 13px;
  font-weight: 690;
  letter-spacing: -0.025em;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: color 220ms var(--motion-soft), transform 90ms var(--motion-ease);
}

.class-top-segment-button.is-active {
  color: var(--text);
}

.class-top-segment-button:active {
  transform: scale(.965);
}

.class-station-content {
  min-width: 0;
}

html.school-samsung .class-top-segment::before {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

@media (min-width: 700px) {
  .class-top-segment {
    width: min(100%, 620px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .class-top-segment::before,
  .class-top-segment-pill,
  .class-top-segment-button {
    transition-duration: .01ms !important;
  }
}
`

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview class top segment marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview class top segment range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const CLASS_SEGMENT_COMPONENT = String.raw`
function useClassTopSegmentSpring(activeIndex) {
  const containerRef = useRef(null)
  const indicatorRef = useRef(null)
  const buttonRefs = useRef([])
  const physicsRef = useRef({
    x: 0,
    velocity: 0,
    targetX: 0,
    baseWidth: 0,
    initialized: false,
    frame: null,
    lastTime: 0,
  })

  useLayoutEffect(() => {
    const container = containerRef.current
    const indicator = indicatorRef.current
    const targetButton = buttonRefs.current[activeIndex]
    if (!container || !indicator || !targetButton) return undefined

    const physics = physicsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const padding = Number.parseFloat(window.getComputedStyle(container).getPropertyValue('--segment-padding')) || 5

    indicator.dataset.springMotion = 'true'
    indicator.style.setProperty('left', '0px', 'important')
    indicator.style.setProperty('transition', 'none', 'important')

    function paint() {
      const speed = Math.abs(physics.velocity)
      const stretch = Math.min(speed * ${PREVIEW_CLASS_SEGMENT_PHYSICS.stretchPerVelocity}, ${PREVIEW_CLASS_SEGMENT_PHYSICS.maxStretch})
      const movingRight = physics.velocity > 0
      const movingLeft = physics.velocity < 0
      const visualX = movingLeft ? physics.x - stretch : physics.x
      const visualWidth = physics.baseWidth + stretch
      const compression = Math.min(speed / ${PREVIEW_CLASS_SEGMENT_PHYSICS.compressionVelocity}, ${PREVIEW_CLASS_SEGMENT_PHYSICS.maxCompression})
      const visualRight = visualX + visualWidth
      const containerWidth = container.clientWidth || 1
      const leftShellStretch = Math.max(0, padding - visualX)
      const rightShellStretch = Math.max(0, visualRight - (containerWidth - padding))
      const shellScaleX = (containerWidth + leftShellStretch + rightShellStretch) / containerWidth
      const shellShiftX = (rightShellStretch - leftShellStretch) / 2

      container.style.setProperty('--segment-shell-scale-x', shellScaleX.toFixed(5))
      container.style.setProperty('--segment-shell-shift-x', shellShiftX.toFixed(3) + 'px')
      indicator.style.setProperty('width', visualWidth + 'px', 'important')
      indicator.style.setProperty('transform', 'translate3d(' + visualX + 'px, 0, 0) scaleY(' + (1 - compression) + ')', 'important')
      indicator.style.setProperty('border-radius', Math.max(11, 14 - stretch * ${PREVIEW_CLASS_SEGMENT_PHYSICS.radiusShrinkPerStretch}) + 'px', 'important')
      indicator.dataset.direction = movingRight ? 'right' : movingLeft ? 'left' : 'still'
    }

    function measure(immediate = false) {
      const containerRect = container.getBoundingClientRect()
      const buttonRect = targetButton.getBoundingClientRect()
      physics.targetX = buttonRect.left - containerRect.left
      physics.baseWidth = buttonRect.width

      if (!physics.initialized || immediate || reduceMotion) {
        physics.initialized = true
        physics.x = physics.targetX
        physics.velocity = 0
        paint()
      }
    }

    function stopAnimation() {
      if (physics.frame !== null) {
        cancelAnimationFrame(physics.frame)
        physics.frame = null
      }
    }

    function animate(time) {
      if (!physics.lastTime) physics.lastTime = time
      const dt = Math.min((time - physics.lastTime) / 1000, ${PREVIEW_CLASS_SEGMENT_PHYSICS.maxDt})
      physics.lastTime = time

      const displacement = physics.x - physics.targetX
      const springForce = -${PREVIEW_CLASS_SEGMENT_PHYSICS.stiffness} * displacement
      const dampingForce = -${PREVIEW_CLASS_SEGMENT_PHYSICS.damping} * physics.velocity
      const acceleration = (springForce + dampingForce) / ${PREVIEW_CLASS_SEGMENT_PHYSICS.mass}

      physics.velocity += acceleration * dt
      physics.x += physics.velocity * dt
      paint()

      const settled = Math.abs(physics.x - physics.targetX) < ${PREVIEW_CLASS_SEGMENT_PHYSICS.settleDistancePx}
        && Math.abs(physics.velocity) < ${PREVIEW_CLASS_SEGMENT_PHYSICS.settleVelocityPx}
      if (settled) {
        physics.x = physics.targetX
        physics.velocity = 0
        physics.lastTime = 0
        physics.frame = null
        container.style.setProperty('--segment-shell-scale-x', '1')
        container.style.setProperty('--segment-shell-shift-x', '0px')
        paint()
        return
      }

      physics.frame = requestAnimationFrame(animate)
    }

    stopAnimation()
    measure(!physics.initialized)
    if (!reduceMotion && Math.abs(physics.x - physics.targetX) > 0.01) {
      physics.lastTime = 0
      physics.frame = requestAnimationFrame(animate)
    }

    const handleViewportChange = () => {
      stopAnimation()
      physics.lastTime = 0
      measure(true)
      container.style.setProperty('--segment-shell-scale-x', '1')
      container.style.setProperty('--segment-shell-shift-x', '0px')
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('orientationchange', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)

    return () => {
      stopAnimation()
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('orientationchange', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
    }
  }, [activeIndex])

  return { containerRef, indicatorRef, buttonRefs }
}

function ClassTopSegment({ section, onSectionChange }) {
  const activeIndex = section === 'board' ? 1 : 0
  const spring = useClassTopSegmentSpring(activeIndex)
  const touchIntentRef = useRef({ key: '', at: 0 })
  const items = [
    { id: 'timetable', label: '시간표' },
    { id: 'board', label: '게시판' },
  ]

  function selectSection(nextSection, pointerType = '') {
    if (nextSection === section) return
    if (pointerType && pointerType !== 'mouse') {
      touchIntentRef.current = { key: nextSection, at: performance.now() }
    }
    onSectionChange(nextSection)
  }

  return (
    <div ref={spring.containerRef} className="class-top-segment" role="group" aria-label="우리 반 메뉴">
      <span ref={spring.indicatorRef} className="class-top-segment-pill" aria-hidden="true" />
      {items.map((item, index) => (
        <button
          ref={(node) => { spring.buttonRefs.current[index] = node }}
          key={item.id}
          type="button"
          className={'class-top-segment-button ' + (section === item.id ? 'is-active' : '')}
          aria-pressed={section === item.id}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            selectSection(item.id, event.pointerType)
          }}
          onClick={() => {
            const intent = touchIntentRef.current
            if (intent.key === item.id && performance.now() - intent.at < 700) {
              touchIntentRef.current = { key: '', at: 0 }
              return
            }
            selectSection(item.id)
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function ClassStationPage({ section, onSectionChange, timetablePage, boardPage }) {
  return (
    <section className="class-station-page">
      <ClassTopSegment section={section} onSectionChange={onSectionChange} />
      <div className="class-station-content">
        {section === 'board' ? boardPage : timetablePage}
      </div>
    </section>
  )
}
`

function patchMainSource(source) {
  let next = String(source || '')

  next = replaceRequired(
    next,
    `function AppShell({ profile }) {`,
    `${CLASS_SEGMENT_COMPONENT}\nfunction AppShell({ profile }) {`,
    'segment component injection',
  )

  next = replaceRequired(
    next,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)\n  const classMiniSpring = useStationLikePillSpring(classSection === 'board' ? 1 : 0, classNavExpanded || classNavCollapsing)\n  useClassStationLayoutSpring(navRef, classNavExpanded)\n  useNestedGeometryCoupling(navRef, classNavExpanded || classNavCollapsing, activeTab === 'class')\n  useClassCollapseSettledGuard(navRef, classNavCollapsing, setClassNavCollapsing, classExitReleaseTimerRef)`,
    `  const { navRef, indicatorRef, buttonRefs } = useNavSpring(activeIndex)`,
    'disconnect nested class physics',
  )

  const classContent = `    class: (\n      <ClassStationPage\n        section={classSection}\n        onSectionChange={setClassSection}\n        boardPage={<PreviewBoardPage />}\n        timetablePage={(\n          <TimetablePage\n            now={now}\n            weeklySchedule={weeklySchedule}\n            overrides={overrides}\n            sharedWeeklySchedule={sharedWeeklySchedule}\n            sharedOverrides={sharedOverrides}\n            personalWeeklySchedule={personalWeeklySchedule}\n            personalOverrides={personalOverrides}\n            onSaveWeekly={commitWeeklySchedule}\n            onSaveOverrides={commitOverrides}\n            onSavePersonalWeekly={commitPersonalWeeklySchedule}\n            onSavePersonalOverrides={commitPersonalOverrides}\n            activity={activity}\n            profile={profile}\n            requireOnline={requireOnline}\n          />\n        )}\n      />\n    ),\n`
  next = spliceRequired(
    next,
    `    class: classSection === 'board' ? (`,
    `    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,`,
    `${classContent}    ai: <PreviewAIPage onOpenAI={() => setAiOpen(true)} />,`,
    'class page content',
  )

  next = spliceRequired(
    next,
    `  function changeTab(nextTab) {`,
    `\n\n  return (`,
    `  function changeTab(nextTab) {\n    if (nextTab === activeTabRef.current) return\n    commitStationTab(nextTab)\n  }`,
    'simple top-level station change',
  )

  next = replaceRequired(
    next,
    `        className={\`bottom-nav ${'${classNavExpanded ? \'is-class-expanded\' : \'\'}'} ${'${classNavCollapsing ? \'is-class-collapsing\' : \'\'}'}\`}`,
    `        className="bottom-nav"`,
    'fixed five-station bottom nav',
  )

  const capsuleStart = `        <div\n          ref={classMiniSpring.containerRef}\n          className={\`class-nav-capsule`
  const capsuleIndex = next.indexOf(capsuleStart)
  const navCloseIndex = next.indexOf(`      </nav>`, capsuleIndex)
  if (capsuleIndex < 0 || navCloseIndex < 0) {
    throw new Error('Preview class top segment range missing: nested capsule markup')
  }
  next = `${next.slice(0, capsuleIndex)}${next.slice(navCloseIndex)}`

  return next
}

export function patchPreviewClassTopSegmentSource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/styles.css')) {
    const current = String(source || '')
    if (current.includes('Preview-only replacement for the nested class station.')) return current
    return `${current}\n${CLASS_TOP_SEGMENT_CSS}`
  }
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
