const SHARED_IMPORT = "import { useSHubSegmentSpring } from './s-hub-segment-spring.js'"

function countOccurrences(source, marker) {
  return marker ? String(source || '').split(marker).length - 1 : 0
}

function ensureImport(source) {
  const current = String(source || '')
  if (current.includes(SHARED_IMPORT)) return current
  if (!current.startsWith('import React')) {
    throw new Error('Shared segment spring owner drift: React import must remain first')
  }
  const lineEnd = current.indexOf('\n')
  if (lineEnd < 0) throw new Error('Shared segment spring owner drift: React import line missing')
  return `${current.slice(0, lineEnd + 1)}${SHARED_IMPORT}\n${current.slice(lineEnd + 1)}`
}

function replaceFunction(source, startMarker, endMarker, replacement, label) {
  const current = String(source || '')
  if (current.includes(replacement)) return current
  const count = countOccurrences(current, startMarker)
  if (count !== 1) {
    throw new Error(`Shared segment spring owner drift: expected one ${label}, found ${count}`)
  }
  const start = current.indexOf(startMarker)
  const end = current.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error(`Shared segment spring owner drift: ${label} boundary missing`)
  return `${current.slice(0, start)}${replacement}${current.slice(end)}`
}

const CLASS_WRAPPER = `function useClassTopSegmentSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--segment-padding',
    shellScaleProperty: '--segment-shell-scale-x',
    shellShiftProperty: '--segment-shell-shift-x',
    fallbackPadding: 5,
  })
}

`

const STUDY_WRAPPER = `function useStudyRankingScopeSpring(activeIndex) {
  return useSHubSegmentSpring(activeIndex, {
    paddingProperty: '--study-ranking-padding',
    shellScaleProperty: '--study-ranking-shell-scale-x',
    shellShiftProperty: '--study-ranking-shell-shift-x',
    fallbackPadding: 4,
  })
}

`

export function patchSharedSegmentSpringOwnerSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  let next = String(source || '')

  if (cleanId.endsWith('/src/main.jsx')) {
    if (!next.includes('function useClassTopSegmentSpring(activeIndex) {')) return next
    next = ensureImport(next)
    return replaceFunction(
      next,
      'function useClassTopSegmentSpring(activeIndex) {',
      'function ClassTopSegment({ section, onSectionChange }) {',
      CLASS_WRAPPER,
      'class segment spring',
    )
  }

  if (cleanId.endsWith('/src/preview-study.jsx')) {
    if (!next.includes('function useStudyRankingScopeSpring(activeIndex) {')) return next
    next = ensureImport(next)
    return replaceFunction(
      next,
      'function useStudyRankingScopeSpring(activeIndex) {',
      'function StudyRanking({',
      STUDY_WRAPPER,
      'study ranking segment spring',
    )
  }

  return next
}
