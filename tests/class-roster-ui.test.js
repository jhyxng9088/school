import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home presence control is source-owned by a real React button', () => {
  const index = read('index.html')
  const source = read('src/class-roster-ui-v2.js')
  const main = read('src/main.jsx')
  const css = read('src/class-roster.css')

  assert.doesNotMatch(index, /<script type="module" src="\/src\/class-roster-ui-v2\.js"><\/script>/)
  assert.match(main, /import \{ openClassRoster \} from '\.\/class-roster-ui-v2\.js'/)
  assert.doesNotMatch(index, /src="\/src\/class-roster-ui\.js"/)
  assert.match(source, /import \{ ensureSignedIn, readStudentProfile \} from '\.\/school-sync'/)
  assert.match(source, /school-reminder-backend\.vercel\.app\/api\/class-roster-v2/)
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /export function openClassRoster\(\{ keyboard = false \} = \{\}\)/)
  assert.doesNotMatch(source, /enhancedCounters/)
  assert.doesNotMatch(source, /function enhanceCounter/)
  assert.doesNotMatch(source, /counter\.setAttribute\('role', 'button'\)/)
  assert.doesNotMatch(source, /counter\.setAttribute\('tabindex', '0'\)/)
  assert.doesNotMatch(source, /counter\.addEventListener\('click'/)
  assert.match(source, /class-roster-modal/)
  assert.match(source, /class-roster-title/)
  assert.match(source, /등록 확인 필요/)
  assert.match(source, /잘못된 인원으로 합치지 않고 따로 보류했어요/)

  assert.match(main, /<button/)
  assert.match(main, /type="button"/)
  assert.match(main, /class-presence-count is-roster-button/)
  assert.match(main, /onClick=\{\(event\) => openClassRoster\(\{ keyboard: event\.detail === 0 \}\)\}/)
  assert.match(css, /\.class-presence-count\.is-roster-button[\s\S]*border: 0;[\s\S]*background: transparent;/)
})

test('roster orphan cleanup stays authenticated and explicitly revalidates after an archive', () => {
  const source = read('src/class-roster-ui-v2.js')

  assert.match(source, /CLASS_ROSTER_REPAIR_API_URL = 'https:\/\/school-reminder-backend\.vercel\.app\/api\/class-roster-repair'/)
  assert.match(source, /async function repairRosterIfNeeded\(\)/)
  assert.match(source, /if \(repairAttempted \|\| repairPromise \|\| !cachedRoster\?\.unresolved\) return null/)
  assert.match(source, /fetch\(CLASS_ROSTER_REPAIR_API_URL, \{[\s\S]*method: 'POST'/)
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /if \(Number\(payload\?\.archived \|\| 0\) > 0\)/)
  assert.match(source, /await fetchRoster\(\{ force: true \}\)/)
})

test('roster reads are demand-driven, locally cached, and never poll or rewrite the React counter', () => {
  const source = read('src/class-roster-ui-v2.js')

  assert.match(source, /ROSTER_FRESH_MS = 2 \* 60_000/)
  assert.match(source, /ROSTER_STALE_CACHE_MS = 24 \* 60 \* 60_000/)
  assert.match(source, /ROSTER_CACHE_PREFIX = 'school\.classRoster\.v2\.'/)
  assert.match(source, /function hydrateRosterCache\(\)/)
  assert.match(source, /localStorage\.getItem\(key\)/)
  assert.match(source, /localStorage\.setItem\(key, JSON\.stringify\(\{ checkedAt: lastFetchedAt, roster: cachedRoster \}\)\)/)
  assert.match(source, /void refreshModal\(\{ force: false, showLoading: false \}\)/)
  assert.doesNotMatch(source, /window\.setInterval\(/)
  assert.doesNotMatch(source, /Initial class roster load failed/)
  assert.doesNotMatch(source, /Class roster periodic refresh failed/)
  assert.doesNotMatch(source, /querySelector\('\.class-presence-count'\)/)
  assert.doesNotMatch(source, /function syncCounter\(/)
  assert.doesNotMatch(source, /function applyRosterCounter\(/)
})

test('live per-student presence stays visible without restoring roster polling', () => {
  const source = read('src/class-roster-ui-v2.js')
  const presence = read('src/supabase-presence.js')

  assert.match(source, /studentKey: String\(member\?\.studentKey/)
  assert.match(source, /function applyLivePresenceSnapshot\(detail\)/)
  assert.match(source, /activeKeys\.has\(member\.studentKey\)/)
  assert.match(source, /window\.addEventListener\('school:class-presence'/)
  assert.match(source, /renderRoster\(\{ animateRows: false, force: true \}\)/)
  assert.match(presence, /activeStudentKeys/)
  assert.match(presence, /dispatchPresenceSnapshot\(classId, online, activeStudentKeys\)/)
  assert.doesNotMatch(source, /window\.setInterval\(/)
})

test('first roster open paints cached data immediately without forced pointer focus or refresh replay', () => {
  const source = read('src/class-roster-ui-v2.js')
  const css = read('src/class-roster.css')

  assert.match(source, /function scheduleModalWarmup\(\)/)
  assert.match(source, /requestIdleCallback/)
  assert.match(source, /if \(modal\.layer\.classList\.contains\('is-visible'\)\) return/)
  assert.match(source, /if \(cachedRoster\) renderRoster\(\{ animateRows: true, force: true \}\)\n  else renderRoster\(\{ loading: true \}\)/)
  assert.match(source, /void refreshModal\(\{ force: false, showLoading: false \}\)/)
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/)
  assert.doesNotMatch(source, /requestAnimationFrame\(\(\) => requestAnimationFrame/)
  assert.match(source, /if \(keyboard\) modal\.close\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /row\.className = `class-roster-row\$\{animate \? '' : ' is-static'\}`/)
  assert.match(css, /\.class-roster-row\.is-static[\s\S]*animation: none/)
})

test('class roster modal updates its own summary without observing or mutating the React counter', () => {
  const source = read('src/class-roster-ui-v2.js')

  assert.match(source, /const nextSummary = `\$\{cachedRoster\.registeredTotal \|\| cachedRoster\.total\}명 · 현재 \$\{currentRosterOnline\(\)\}명 접속`/)
  assert.match(source, /if \(modalState\.summary\.textContent !== nextSummary\) modalState\.summary\.textContent = nextSummary/)
  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /isRosterInternalMutation/)
  assert.doesNotMatch(source, /queueCounterSync/)
  assert.doesNotMatch(source, /parseCounter/)
  assert.doesNotMatch(source, /lastRenderedLabel/)
})

test('class roster modal keeps restrained open-close motion and reduced-motion fallback', () => {
  const css = read('src/class-roster.css')

  assert.match(css, /\.class-roster-modal[\s\S]*transform: translate3d\(0, 13px, 0\) scale\(0\.982\)/)
  assert.match(css, /\.class-roster-layer\.is-open \.class-roster-modal[\s\S]*scale\(1\)/)
  assert.match(css, /animation: class-roster-row-in 460ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.class-roster-row[\s\S]*animation: none !important/)
})
