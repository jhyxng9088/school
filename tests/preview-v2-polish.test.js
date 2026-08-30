import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const text = (path) => readFileSync(resolve(root, path), 'utf8')

test('grouped class and schedule navigation uses one shared spring indicator without the old glitch bridge', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  const css = text('src/preview-v2-hotfix.css')
  assert.match(hotfix, /function moveSpringIndicator/)
  assert.match(hotfix, /requestAnimationFrame\(animate\)/)
  assert.match(hotfix, /preview-v2-segment-indicator/)
  assert.match(hotfix, /preview-v2-transition-chrome/)
  assert.match(hotfix, /labels === '게시판\|시간표'/)
  assert.match(hotfix, /labels === '리마인더\|학사일정'/)
  assert.match(hotfix, /existing\.shift\(\)/)
  assert.match(hotfix, /existing\.forEach\(\(node\) => node\.remove\(\)\)/)
  assert.doesNotMatch(hotfix, /preview-v2-chrome-bridge/)
  assert.match(css, /preview-v2-segment-indicator/)
  assert.doesNotMatch(css, /preview-v2-segment:has\(> button:nth-of-type\(2\)\.is-selected\)::before/)
})

test('preview nav spring is device-independent instead of disabling iPhone or Samsung motion', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  assert.match(hotfix, /syncNavSpring/)
  assert.match(hotfix, /moveSpringIndicator\(nav, indicator, selected/)
  assert.doesNotMatch(hotfix, /SamsungBrowser/)
  assert.doesNotMatch(hotfix, /MOBILE_BROWSER_COMPAT/)
  assert.doesNotMatch(hotfix, /iPhone\|iPod\|Android/)
})

test('preview board copy is normalized to polite Korean', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  assert.match(hotfix, /아직 글이 없어요\./)
  assert.match(hotfix, /첫 질문이나 반 소식을 올려 보세요\./)
  assert.match(hotfix, /궁금한 내용을 입력해 주세요\./)
  assert.match(hotfix, /적어 주세요\./)
})

test('preview AI uses page presentation and core routing waits for the real trigger', () => {
  const sheet = text('src/unified-sheet.jsx')
  const preview = text('src/preview-v2.js')
  const css = text('src/preview-v2-hotfix.css')
  assert.match(sheet, /previewAIPagePresentation/)
  assert.match(sheet, /unified-school-page/)
  assert.match(sheet, /if \(!rendered \|\| pagePresentation\) return undefined/)
  assert.match(sheet, /role="region"/)
  assert.match(sheet, /aria-modal="false"/)
  assert.match(preview, /AI_TRIGGER_TIMEOUT_MS = 1600/)
  assert.match(preview, /function waitForTrigger/)
  assert.match(preview, /requestAnimationFrame\(waitForTrigger\)/)
  assert.match(preview, /\.home-ai-trigger/)
  assert.doesNotMatch(preview, /waitFrames\(\(\) => \{[\s\S]{0,250}\.home-ai-trigger[\s\S]{0,250}\}, 2\)/)
  assert.match(css, /unified-school-page\.preview-v2-ai-page/)
})

test('study preview keeps one page shell and updates its hero and lists in place', () => {
  const preview = text('src/preview-v2.js')
  const hotfix = text('src/preview-v2-hotfix.js')
  const css = text('src/preview-v2-hotfix.css')
  assert.match(preview, /function ensureStudyLayer/)
  assert.match(preview, /routeLayer\.dataset\.previewPage === 'study'/)
  assert.match(preview, /function renderStudyHero/)
  assert.match(preview, /function renderStudyActiveList/)
  assert.match(preview, /function renderStudyRanking/)
  assert.match(preview, /data-study-started-at/)
  assert.match(preview, /hero\.dataset\.studyMode === nextMode/)
  assert.match(hotfix, /previewBookIcon/)
  assert.match(hotfix, /우리 반 랭킹/)
  assert.match(hotfix, /전체 랭킹/)
  assert.match(hotfix, /globalTotals/)
  assert.match(hotfix, /animateNumber/)
  assert.match(css, /is-study-transitioning/)
  assert.match(css, /preview-v2-ranking-row/)
})

test('academic list receives staggered preview entrance motion', () => {
  const hotfix = text('src/preview-v2-hotfix.js')
  assert.match(hotfix, /animateAcademicList/)
  assert.match(hotfix, /academic-focus-card/)
  assert.match(hotfix, /academic-list-item/)
  assert.match(hotfix, /delay: Math\.min\(index \* 38, 190\)/)
})

test('preview AI context contains student-visible app data and explicitly excludes admin scopes', () => {
  const context = text('src/preview-v2-ai-context.js')
  const ai = text('src/s-hub-ai.js')
  assert.match(context, /MEAL_CACHE_KEY/)
  assert.match(context, /classBoard/)
  assert.match(context, /study:/)
  assert.match(context, /classRoster/)
  assert.match(context, /scope: 'student-visible-only'/)
  assert.match(context, /adminFeaturesIncluded: false/)
  assert.match(context, /superAdminFeaturesIncluded: false/)
  assert.match(context, /api\/class-roster/)
  assert.doesNotMatch(context, /\/api\/(?:admin|super(?:-?admin)?)(?:[/'"`?]|$)/i)
  assert.match(ai, /enrichPreviewAIContext/)
})

test('preview study backend keeps a separate global daily aggregate without changing resource count', () => {
  const service = text('push-backend-v2/lib/preview-v2-service.js')
  assert.match(service, /collection\('previewV2StudyGlobalDaily'\)/)
  assert.match(service, /globalTotals/)
  assert.match(service, /classNumber: student\.classNumber/)
  assert.match(service, /return value === 'board' \|\| value === 'study'/)
})
