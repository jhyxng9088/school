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
import { patchPreviewStationNavRefinementSource } from './src/preview-station-nav-refine-patch.js'
import { patchPreviewStationJellyMotionSource } from './src/preview-station-jelly-motion-patch.js'
import { patchPreviewNestedStationReactionSource } from './src/preview-nested-station-reaction-patch.js'
import { patchPreviewUnifiedStationPhysicsSource } from './src/preview-unified-station-physics-patch.js'
import { patchPreviewPhysicalClassCouplingSource } from './src/preview-physical-class-coupling-patch.js'
import { patchPreviewNestedGeometryCouplingSource } from './src/preview-nested-geometry-coupling-patch.js'
import { patchPreviewNavResponsivenessSource } from './src/preview-nav-responsiveness-patch.js'

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

function previewLocalStorageText(source) {
  return String(source || '')
    .split("'school.").join("'school.preview.")
    .split('"school.').join('"school.preview.')
    .split('`school.').join('`school.preview.')
}

function replacePreviewSource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.includes('/src/')) return String(source || '')

  let next = previewLocalStorageText(source)
  next = next
    .split("'school-sync'").join("'school-sync-preview'")
    .split('"school-sync"').join('"school-sync-preview"')

  if (cleanId.endsWith('/school-sync.js')) {
    const classMarker = "return normalized ? `class-${normalized.classNumber}` : ''"
    const identityMarker = 'return `${normalized.classNumber}|${normalized.studentNumber}|${compactName}`'
    if (!next.includes(classMarker)) throw new Error('Preview class identity marker changed unexpectedly')
    if (!next.includes(identityMarker)) throw new Error('Preview student identity marker changed unexpectedly')
    next = next.replace(classMarker, "return normalized ? `preview-class-${normalized.classNumber}` : ''")
    next = next.replace(identityMarker, 'return `preview|${normalized.classNumber}|${normalized.studentNumber}|${compactName}`')
  }

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
  return next
}

function patchPreviewPublicBuildFiles(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !['.js', '.html'].some((extension) => entry.name.endsWith(extension))) continue
    const filePath = path.join(directory, entry.name)
    const current = fs.readFileSync(filePath, 'utf8')
    let next = previewLocalStorageText(current)

    if (entry.name === 'sw.js') {
      next = next
        .split("'school-shell-v154'").join("'school-shell-v155'")
        .split("'school-shell-").join("'school-preview-shell-")
        .split("'school-notification-profile-").join("'school-preview-notification-profile-")
      const cleanupMarker = ".filter((key) => ![CACHE_NAME, NOTIFICATION_PROFILE_CACHE].includes(key))"
      const isolatedCleanup = ".filter((key) => key.startsWith('school-preview-') && ![CACHE_NAME, NOTIFICATION_PROFILE_CACHE].includes(key))"
      if (!next.includes(cleanupMarker)) throw new Error('Preview service worker cache cleanup marker changed unexpectedly')
      next = next.replace(cleanupMarker, isolatedCleanup)
    }

    if (next !== current) fs.writeFileSync(filePath, next)
  }
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

function previewIsolationPlugin() {
  return {
    name: 'school-preview-isolation',
    enforce: 'pre',
    transform(code, id) {
      const next = replacePreviewSource(code, id)
      return next === code ? null : { code: next, map: null }
    },
    closeBundle() {
      patchPreviewPublicBuildFiles(path.resolve('dist'))
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
        || cleanId.endsWith('/preview-station-nav-patch.js')
        || cleanId.endsWith('/preview-station-nav-refine-patch.js')
        || cleanId.endsWith('/preview-station-jelly-motion-patch.js')
        || cleanId.endsWith('/preview-nested-station-reaction-patch.js')
        || cleanId.endsWith('/preview-unified-station-physics-patch.js')
        || cleanId.endsWith('/preview-physical-class-coupling-patch.js')
        || cleanId.endsWith('/preview-nested-geometry-coupling-patch.js')
        || cleanId.endsWith('/preview-nav-responsiveness-patch.js')
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
  plugins: [previewIsolationPlugin(), politeCopyPlugin(), react()],
  base: '/school/',
})