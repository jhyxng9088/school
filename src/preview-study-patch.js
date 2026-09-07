function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview study patch marker missing: ${label}`)
  return source.replace(marker, replacement)
}

function spliceRequired(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Preview study patch range missing: ${label}`)
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

const STUDY_RANKING_SPRING_RUNTIME = String.raw`
function useStudyRankingScopeSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--study-ranking-padding',
    shellScaleProperty: '--study-ranking-shell-scale-x',
    shellShiftProperty: '--study-ranking-shell-shift-x',
    fallbackPadding: 4,
  })
}

`

const STUDY_RANKING_SPRING_CSS = String.raw`

/* Study ranking scope uses the exact class top-segment spring mechanism. */
.preview-study-ranking-tabs {
  --study-ranking-padding: 4px;
  position: relative;
  height: 46px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  padding: var(--study-ranking-padding);
  overflow: visible;
  border: 0;
  border-radius: 18px;
  background: transparent;
  contain: layout;
  isolation: isolate;
  touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;
}

.preview-study-ranking-tabs::before {
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
  transform: translate3d(var(--study-ranking-shell-shift-x, 0px), 0, 0) scaleX(var(--study-ranking-shell-scale-x, 1));
  transform-origin: 50% 50%;
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.preview-study-ranking-pill {
  position: absolute;
  z-index: 1;
  top: var(--study-ranking-padding);
  bottom: var(--study-ranking-padding);
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

.preview-study-ranking-tabs button {
  position: relative;
  z-index: 2;
  min-width: 0;
  min-height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  box-shadow: none;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 13px;
  font-weight: 690;
  letter-spacing: -0.025em;
  cursor: pointer;
  touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;
  transition: color 220ms var(--motion-soft), transform 90ms var(--motion-ease);
}

.preview-study-ranking-tabs button.is-selected,
html.school-samsung .preview-study-ranking-tabs button.is-selected {
  background: transparent;
  box-shadow: none;
  color: var(--text);
}

.preview-study-ranking-tabs button:active {
  transform: scale(.965);
}

.preview-study-ranking-stage {
  animation: none;
  will-change: transform, opacity;
}

.preview-study-ranking-stage[data-direction="forward"] {
  animation: preview-study-ranking-forward 360ms cubic-bezier(.16, 1, .3, 1) both;
}

.preview-study-ranking-stage[data-direction="back"] {
  animation: preview-study-ranking-back 360ms cubic-bezier(.16, 1, .3, 1) both;
}

@keyframes preview-study-ranking-forward {
  from {
    opacity: .34;
    transform: translate3d(14px, 0, 0) scale(.996);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes preview-study-ranking-back {
  from {
    opacity: .34;
    transform: translate3d(-14px, 0, 0) scale(.996);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

html.school-samsung .preview-study-ranking-tabs::before {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

@media (prefers-reduced-motion: reduce) {
  .preview-study-ranking-tabs::before,
  .preview-study-ranking-pill,
  .preview-study-ranking-tabs button {
    transition-duration: .01ms !important;
  }

  .preview-study-ranking-stage[data-direction] {
    animation: none !important;
  }
}
`

function patchStudyRankingPageSource(source) {
  let next = String(source || '')
  if (next.includes('function useStudyRankingScopeSpring(activeIndex)')) return next

  next = replaceRequired(
    next,
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'",
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'\nimport { useSHubSegmentSpring } from './s-hub-segment-spring.js'",
    'study ranking shared spring import',
  )

  next = replaceRequired(
    next,
    'function StudyRanking({',
    `${STUDY_RANKING_SPRING_RUNTIME}function StudyRanking({`,
    'study ranking spring runtime',
  )

  next = replaceRequired(
    next,
    `  const waitingForSchool = scope === 'school' && schoolLoading && !schoolSnapshot\n\n  return (`,
    `  const waitingForSchool = scope === 'school' && schoolLoading && !schoolSnapshot\n  const scopeSpring = useStudyRankingScopeSpring(scope === 'school' ? 1 : 0)\n  const [stageDirection, setStageDirection] = useState('forward')\n\n  function selectScope(nextScope) {\n    if (nextScope === scope) return\n    setStageDirection(nextScope === 'school' ? 'forward' : 'back')\n    onScope(nextScope)\n  }\n\n  return (`,
    'study ranking spring state',
  )

  const oldTabs = `      <div className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 범위">\n        <button\n          type="button"\n          className={scope === 'class' ? 'is-selected' : ''}\n          aria-pressed={scope === 'class'}\n          onClick={() => onScope('class')}\n        >\n          우리반\n        </button>\n        <button\n          type="button"\n          className={scope === 'school' ? 'is-selected' : ''}\n          aria-pressed={scope === 'school'}\n          onClick={() => onScope('school')}\n        >\n          전교\n        </button>\n      </div>`

  const newTabs = `      <div ref={scopeSpring.containerRef} className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 범위">\n        <span ref={scopeSpring.indicatorRef} className="preview-study-ranking-pill" aria-hidden="true" />\n        <button\n          ref={(node) => { scopeSpring.buttonRefs.current[0] = node }}\n          type="button"\n          className={scope === 'class' ? 'is-selected' : ''}\n          aria-pressed={scope === 'class'}\n          onClick={() => selectScope('class')}\n        >\n          우리반\n        </button>\n        <button\n          ref={(node) => { scopeSpring.buttonRefs.current[1] = node }}\n          type="button"\n          className={scope === 'school' ? 'is-selected' : ''}\n          aria-pressed={scope === 'school'}\n          onClick={() => selectScope('school')}\n        >\n          전교\n        </button>\n      </div>`

  next = replaceRequired(next, oldTabs, newTabs, 'study ranking segmented control')
  next = replaceRequired(
    next,
    '      <div className="preview-study-ranking-stage" key={scope}>',
    '      <div className="preview-study-ranking-stage" data-direction={stageDirection} key={scope}>',
    'study ranking directional stage',
  )
  return next
}

function patchStudyRankingStyleSource(source) {
  const current = String(source || '')
  if (current.includes('Study ranking scope uses the exact class top-segment spring mechanism.')) return current
  return `${current}${STUDY_RANKING_SPRING_CSS}`
}

function patchMainSource(source) {
  let next = String(source || '')
  const importMarker = "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n"
  if (!next.includes("from './preview-study.jsx'")) {
    next = replaceRequired(
      next,
      importMarker,
      `${importMarker}import { PreviewStudyPage as PreviewStudyFeaturePage } from './preview-study.jsx'\n`,
      'study page import',
    )
  }

  const studyWrapper = `function PreviewStudyPage({ requireOnline }) {\n  return <PreviewStudyFeaturePage requireOnline={requireOnline} />\n}\n\n`
  next = spliceRequired(
    next,
    'function PreviewStudyPage() {\n',
    'function PreviewAIPage({ onOpenAI }) {',
    studyWrapper,
    'study placeholder replacement',
  )

  next = replaceRequired(
    next,
    '    study: <PreviewStudyPage />,\n',
    '    study: <PreviewStudyPage requireOnline={requireOnline} />,\n',
    'study content props',
  )

  return next
}

export function patchPreviewStudySource(source, id = '') {
  const cleanId = String(id || '').split('?')[0]
  if (cleanId.endsWith('/preview-study.jsx')) return patchStudyRankingPageSource(source)
  if (cleanId.endsWith('/preview-study-ranking.css')) return patchStudyRankingStyleSource(source)
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
