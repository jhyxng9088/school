import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewAIPageSource } from '../src/preview-ai-page-patch.js'
import { patchPreviewFastCacheSource } from '../src/preview-fast-cache-patch.js'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'
import { patchPreviewStudyUnifiedUISource } from '../src/preview-study-unified-ui-patch.js'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study bottom navigation uses the source-owned shared minimal open-book icon', () => {
  const main = read('src/main.jsx')
  const registry = read('src/s-hub-icon.jsx')

  assert.match(main, /return <SHubIcon name=\{type\} size=\{size\} \/>/)
  assert.match(registry, /M2\.8 5\.2c3\.6-\.9 6\.7\.1 9\.2 2\.8/)
  assert.match(registry, /M21\.2 5\.2c-3\.6-\.9-6\.7\.1-9\.2 2\.8/)
  assert.match(registry, /M12 8v11\.2/)
  assert.doesNotMatch(main, /M4\.2 5\.1h5\.5/)
})

test('study ranking client sends today/all period without changing the existing endpoint', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study-client.js'), '/workspace/src/preview-study-client.js')

  assert.match(source, /period = 'today'/)
  assert.match(source, /normalizedPeriod = period === 'all' \? 'all' : 'today'/)
  assert.match(source, /'&period=' \+ encodeURIComponent\(normalizedPeriod\)/)
  assert.match(source, /period: source\.period === 'all' \? 'all' : 'today'/)
  assert.match(source, /requestStudy\(\{ signal, scope, period \}\)/)
  assert.match(source, /functions\/v1\/class-study/)
})

test('study ranking period survives the real preceding Vite transforms without polluting today cache', () => {
  const pageId = '/workspace/src/preview-study.jsx'
  let page = read('src/preview-study.jsx')
  page = patchPreviewStudySource(page, pageId)
  page = patchPreviewFastCacheSource(page, pageId)
  page = patchPreviewStudyUnifiedUISource(page, pageId)
  page = patchStudyVisualPolishSource(page, pageId)

  assert.match(page, /aria-label="공부 랭킹 기간"/)
  assert.match(page, /const periodSpring = useStudyRankingScopeSpring\(period === 'all' \? 1 : 0\)/)
  assert.match(page, /ref=\{periodSpring\.containerRef\} className="preview-study-ranking-tabs" role="group" aria-label="공부 랭킹 기간"/)
  assert.match(page, /ref=\{periodSpring\.indicatorRef\} className="preview-study-ranking-pill"/)
  assert.match(page, /periodSpring\.buttonRefs\.current\[0\] = node/)
  assert.match(page, /periodSpring\.buttonRefs\.current\[1\] = node/)
  assert.match(page, /ref=\{scopeSpring\.containerRef\} className="preview-study-ranking-tabs"/)
  assert.match(page, /data-direction=\{stageDirection\} key=\{\[scope, period\]\.join\(':'\)\}/)
  assert.match(page, /schoolCacheValidatedRef\.current = true/)
  assert.match(page, /rankingPeriod !== 'today'/)

  const clientId = '/workspace/src/preview-study-client.js'
  let client = read('src/preview-study-client.js')
  client = patchPreviewFastCacheSource(client, clientId)
  client = patchStudyVisualPolishSource(client, clientId)

  assert.match(client, /requestStudy\(\{ signal, scope: normalizedScope, period: normalizedPeriod \}\)/)
  assert.match(client, /if \(normalizedPeriod === 'today'\) writePreviewPersistentCache/)
  assert.doesNotMatch(client, /\n  writePreviewPersistentCache\('study', normalizedScope, snapshot\)\n  return snapshot\n\}/)
})

test('study ranking keeps class/school scope and adds an independent today/all period selector', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(source, /aria-label="공부 랭킹 기간"/)
  assert.match(source, />\s*오늘\s*</)
  assert.match(source, />\s*전체\s*</)
  assert.match(source, /aria-label="공부 랭킹 범위"/)
  assert.match(source, />\s*우리반\s*</)
  assert.match(source, />\s*전교\s*</)
  assert.match(source, /rankingPeriod/)
  assert.match(source, /loadPreviewStudy\(\{ scope: targetScope, period: 'all' \}\)/)
  assert.match(source, /studentPeriodSeconds/)
  assert.match(source, /runningSegmentSeconds/)
  assert.match(source, /key=\{\[scope, period\]\.join\(':'\)\}/)
})

test('all-time study ranking refreshes only when the all period is selected', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')

  assert.match(source, /rankingPeriodRef\.current === 'all' && rankingScopeRef\.current === 'class'/)
  assert.match(source, /refreshAllSchool = rankingPeriodRef\.current === 'all' && rankingScopeRef\.current === 'school'/)
  assert.match(source, /if \(rankingPeriodRef\.current === 'all'\) loadAll\(rankingScopeRef\.current, \{ silent: true \}\)/)
  assert.doesNotMatch(source, /setInterval\([^)]*loadAll/)
})

test('study ranking period controls stay compact and stack only on very narrow screens', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study-ranking.css'), '/workspace/src/preview-study-ranking.css')
  assert.match(source, /\.preview-study-ranking-filters \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(source, /@media \(max-width: 340px\)[\s\S]*grid-template-columns: 1fr/)
})

test('study header uses neutral study-specific copy instead of the V2 product label', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  assert.match(source, /<p className="eyebrow">공부 기록<\/p>/)
  assert.doesNotMatch(source, /<p className="eyebrow">S-Hub V2<\/p>/)
})

test('legacy meal artwork cannot replace the study icon by button position', () => {
  const styles = read('src/stage3.css')

  assert.match(styles, /\.nav-button\[data-tab="meal"\]::before/)
  assert.match(styles, /\.nav-button\[data-tab="academic"\]::before/)
  assert.doesNotMatch(styles, /\.nav-button:nth-of-type\(4\)/)
  assert.doesNotMatch(styles, /\.nav-button:nth-of-type\(5\)/)
})

test('board detail and editor sheets retain their content while UnifiedBottomSheet runs its close animation', () => {
  const source = patchStudyVisualPolishSource(read('src/preview-board-complete.jsx'), '/workspace/src/preview-board-complete.jsx')

  assert.match(source, /BoardDetail\(\{ post: incomingPost,[\s\S]*retainedPostRef = useRef\(incomingPost\)[\s\S]*const post = incomingPost \|\| retainedPostRef\.current/)
  assert.match(source, /BoardPostEditor\(\{ post: incomingPost,[\s\S]*retainedPostRef = useRef\(incomingPost\)[\s\S]*const post = incomingPost \|\| retainedPostRef\.current/)
  assert.match(source, /BoardSectionEditor\(\{ section: incomingSection,[\s\S]*retainedSectionRef = useRef\(incomingSection\)[\s\S]*const section = incomingSection \|\| retainedSectionRef\.current/)
  assert.match(source, /<UnifiedBottomSheet[\s\S]*?open=\{open\}[\s\S]*?onClose=\{onClose\}/)
})

test('board and AI hero descriptions keep Korean words intact when wrapping', () => {
  const boardCss = patchStudyVisualPolishSource(read('src/preview-board.css'), '/workspace/src/preview-board.css')
  assert.match(boardCss, /\.preview-board-header-note \{[\s\S]*word-break: keep-all;[\s\S]*overflow-wrap: break-word;/)

  let aiCss = patchPreviewAIPageSource(read('src/s-hub-ai.css'), '/workspace/src/s-hub-ai.css')
  aiCss = patchStudyVisualPolishSource(aiCss, '/workspace/src/s-hub-ai.css')
  assert.match(aiCss, /\.s-hub-ai-page-title p:last-child \{[\s\S]*word-break: keep-all;[\s\S]*overflow-wrap: break-word;/)
})

test('study visual polish remains downstream of study data and UI transforms after recovery retirement', () => {
  const vite = read('vite.config.js')
  const studyUi = vite.indexOf('patchPreviewStudyUnifiedUISource(next, cleanId)')
  const presence = vite.indexOf('patchPresenceSplitSource(next, cleanId)')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  assert.ok(studyUi >= 0)
  assert.ok(presence > studyUi)
  assert.ok(visual > presence)
  assert.doesNotMatch(vite, /patchProductionRecoverySource/)
  assert.doesNotMatch(vite, /production-recovery-patch\.js/)
})
