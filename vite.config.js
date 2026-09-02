import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  POLITE_AI_TONE,
  POLITE_COPY_REPLACEMENTS,
  POLITE_SOURCE_FRAGMENTS,
} from './src/polite-copy-runtime.js'
import { PREVIEW_POLITE_COPY_REPLACEMENTS } from './src/preview-polite-copy-additions.js'
import { patchPreviewAIReminderSummarySource } from './src/preview-ai-reminder-summary-patch.js'
import { patchPreviewNavSpringSource } from './src/preview-nav-spring-patch.js'
import { patchPreviewReminderPolishSource } from './src/preview-reminder-polish-patch.js'
import { patchPreviewSHubV2Source } from './src/preview-s-hub-v2-patch.js'
import { patchPreviewStationNavSource } from './src/preview-station-nav-patch.js'
import { patchPreviewStudySource } from './src/preview-study-patch.js'
import { patchPreviewStudyUnifiedUISource } from './src/preview-study-unified-ui-patch.js'
import { patchPreviewFastCacheSource } from './src/preview-fast-cache-patch.js'
import { patchPreviewStationNavRefinementSource } from './src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from './src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from './src/preview-nested-station-reaction-patch.js'
import { patchPreviewUnifiedStationPhysicsSource } from './src/preview-unified-station-physics-patch.js'
import { patchPreviewPhysicalClassCouplingSource } from './src/preview-physical-class-coupling-patch.js'
import { patchPreviewNestedGeometryCouplingSource } from './src/preview-nested-geometry-coupling-patch.js'
import { patchPreviewNavResponsivenessSource } from './src/preview-nav-responsiveness-patch.js'
import { patchPreviewClassTopSegmentSource } from './src/preview-class-top-segment-patch.js'
import { patchPreviewClassTopSegmentStyleSource } from './src/preview-class-top-segment-style-patch.js'
import { patchPreviewBoardSource } from './src/preview-board-patch.js'
import { patchPreviewScheduleTopSegmentSource } from './src/preview-schedule-top-segment-patch.js'
import { patchPreviewAIPageSource } from './src/preview-ai-page-patch.js'
import { patchPreviewAIDensitySource } from './src/preview-ai-density-patch.js'
import { patchPreviewAIStageMotionSource } from './src/preview-ai-stage-motion-patch.js'
import { patchPreviewAIBackgroundSource } from './src/preview-ai-background-patch.js'
import { patchPreviewHomeInfoSource } from './src/preview-home-info-patch.js'
import { patchPreviewBoardAllSource } from './src/preview-board-all-patch.js'
import { patchPreviewAILiveContextSource } from './src/preview-ai-live-context-patch.js'
import { patchDataSplitV1Source } from './src/data-split-v1-patch.js'
import { patchPresenceSplitSource } from './src/presence-split-patch.js'
import { patchProductionRecoverySource } from './src/production-recovery-patch.js'
import { patchStudyVisualPolishSource } from './src/study-visual-polish-patch.js'

const AI_PROMPT_MARKERS = [
  '너는 한국 고등학생용 S-Hub의 학교 공지 분석기다.',
  '너는 S-Hub의 학교 정보 질문 도우미다.',
  '너는 S-Hub 내부 학교 정보 검색 도우미다.',
  '너는 한국 고등학생용 학교 리마인더 정리 AI다.',
]

const BUILD_COPY_REPLACEMENTS = [
  ...POLITE_COPY_REPLACEMENTS.filter(([from]) => from !== '등록된 급식이 없어'),
  ...PREVIEW_POLITE_COPY_REPLACEMENTS,
  ['같은 학사일정이 이미 있어.', '같은 학사일정이 이미 있어요.'],
]

function replacePairs(source, pairs) {
  let next = String(source || '')
  const applied = []
  pairs.forEach(([from, to], index) => {
    if (!next.includes(from)) return
    const token = `__S_HUB_POLITE_COPY_${index}_${applied.length}__`
    next = next.split(from).join(token)
    applied.push([token, to])
  })
  for (const [token, to] of applied) next = next.split(token).join(to)
  return next
}

function replaceCopy(source) {
  let next = replacePairs(source, [...BUILD_COPY_REPLACEMENTS, ...POLITE_SOURCE_FRAGMENTS])
  for (const marker of AI_PROMPT_MARKERS) {
    const withTone = `${marker}\n${POLITE_AI_TONE}`
    if (!next.includes(withTone)) next = next.split(marker).join(withTone)
  }
  return next
}

function replaceV2Source(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.includes('/src/')) return String(source || '')

  let next = String(source || '')
  next = patchPreviewNavSpringSource(next, cleanId)
  next = patchPreviewSHubV2Source(next, cleanId)
  next = patchPreviewAIReminderSummarySource(next, cleanId)
  next = patchPreviewReminderPolishSource(next, cleanId)
  next = patchPreviewStationNavSource(next, cleanId)
  next = patchPreviewStationNavRefinementSource(next, cleanId)
  next = patchPreviewStationJellyMotionSource(next, cleanId)
  next = patchPreviewNestedStationReactionSource(next, cleanId)
  next = patchPreviewUnifiedStationPhysicsSource(next, cleanId)
  next = patchPreviewPhysicalClassCouplingSource(next, cleanId)
  next = patchPreviewNestedGeometryCouplingSource(next, cleanId)
  next = patchPreviewNavResponsivenessSource(next, cleanId)
  next = patchPreviewClassTopSegmentSource(next, cleanId)
  next = patchPreviewClassTopSegmentStyleSource(next, cleanId)

  const boardRuntimeFile = cleanId.endsWith('/preview-board-client.js') || cleanId.endsWith('/preview-board-complete.jsx')
  if (boardRuntimeFile) {
    next = patchPreviewFastCacheSource(next, cleanId)
    next = patchPreviewBoardSource(next, cleanId)
  } else {
    next = patchPreviewBoardSource(next, cleanId)
    next = patchPreviewStudySource(next, cleanId)
    next = patchPreviewFastCacheSource(next, cleanId)
  }

  next = patchPreviewScheduleTopSegmentSource(next, cleanId)
  next = patchPreviewAIPageSource(next, cleanId)
  next = patchPreviewAIDensitySource(next, cleanId)
  next = patchPreviewAIStageMotionSource(next, cleanId)
  next = patchPreviewAIBackgroundSource(next, cleanId)
  next = patchPreviewHomeInfoSource(next, cleanId)
  next = patchPreviewBoardAllSource(next, cleanId)
  next = patchPreviewStudyUnifiedUISource(next, cleanId)
  next = patchPreviewAILiveContextSource(next, cleanId)
  next = patchDataSplitV1Source(next, cleanId)
  next = patchPresenceSplitSource(next, cleanId)
  next = patchProductionRecoverySource(next, cleanId)
  next = patchStudyVisualPolishSource(next, cleanId)
  return next
}

function patchPublicBuildFiles(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const filePath = path.join(directory, entry.name)
    const current = fs.readFileSync(filePath, 'utf8')
    const next = replaceCopy(current)
    if (next !== current) fs.writeFileSync(filePath, next)
  }
}

function sHubV2FeaturePlugin() {
  return {
    name: 'school-s-hub-v2-features',
    enforce: 'pre',
    transform(code, id) {
      const next = replaceV2Source(code, id)
      return next === code ? null : { code: next, map: null }
    },
  }
}

function politeCopyPlugin() {
  return {
    name: 'school-polite-copy',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0]
      if (
        !cleanId.includes('/src/')
        || cleanId.endsWith('/polite-copy-runtime.js')
        || cleanId.endsWith('/preview-polite-copy-additions.js')
        || cleanId.endsWith('/preview-s-hub-v2-patch.js')
        || cleanId.endsWith('/preview-ai-reminder-summary-patch.js')
        || cleanId.endsWith('/preview-reminder-polish-patch.js')
        || cleanId.endsWith('/preview-nav-spring-patch.js')
        || cleanId.endsWith('/preview-station-nav-patch.js')
        || cleanId.endsWith('/preview-study-patch.js')
        || cleanId.endsWith('/preview-study-unified-ui-patch.js')
        || cleanId.endsWith('/preview-fast-cache-patch.js')
        || cleanId.endsWith('/preview-station-nav-refine-patch.js')
        || cleanId.endsWith('/preview-station-jelly-motion-patch.js')
        || cleanId.endsWith('/preview-nested-station-reaction-patch.js')
        || cleanId.endsWith('/preview-unified-station-physics-patch.js')
        || cleanId.endsWith('/preview-physical-class-coupling-patch.js')
        || cleanId.endsWith('/preview-nested-geometry-coupling-patch.js')
        || cleanId.endsWith('/preview-nav-responsiveness-patch.js')
        || cleanId.endsWith('/preview-class-top-segment-patch.js')
        || cleanId.endsWith('/preview-class-top-segment-style-patch.js')
        || cleanId.endsWith('/preview-board-patch.js')
        || cleanId.endsWith('/preview-board-all-patch.js')
        || cleanId.endsWith('/preview-schedule-top-segment-patch.js')
        || cleanId.endsWith('/preview-ai-page-patch.js')
        || cleanId.endsWith('/preview-ai-density-patch.js')
        || cleanId.endsWith('/preview-ai-stage-motion-patch.js')
        || cleanId.endsWith('/preview-ai-background-patch.js')
        || cleanId.endsWith('/preview-ai-live-context-patch.js')
        || cleanId.endsWith('/preview-home-info-patch.js')
        || cleanId.endsWith('/data-split-v1-patch.js')
        || cleanId.endsWith('/presence-split-patch.js')
        || cleanId.endsWith('/production-recovery-patch.js')
        || cleanId.endsWith('/study-visual-polish-patch.js')
      ) return null

      const next = replaceCopy(code)
      return next === code ? null : { code: next, map: null }
    },
    closeBundle() {
      patchPublicBuildFiles(path.resolve('dist'))
    },
  }
}

export default defineConfig({
  plugins: [sHubV2FeaturePlugin(), politeCopyPlugin(), react()],
  base: '/school/',
})
