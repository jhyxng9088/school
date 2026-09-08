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
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')
  return patchMainSource(source)
}
