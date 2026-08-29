import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home presence counter loads the authenticated class roster modal without changing main home logic', () => {
  const index = read('index.html')
  const source = read('src/class-roster-ui.js')
  const main = read('src/main.jsx')

  assert.match(index, /<script type="module" src="\/src\/class-roster-ui\.js"><\/script>/)
  assert.match(source, /import \{ ensureSignedIn, readStudentProfile \} from '\.\/school-sync'/)
  assert.match(source, /school-reminder-backend\.vercel\.app\/api\/class-roster'/)
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /counter\.classList\.add\('is-roster-button'\)/)
  assert.match(source, /counter\.setAttribute\('role', 'button'\)/)
  assert.match(source, /counter\.addEventListener\('click', \(\) => openModal\(\)\)/)
  assert.match(source, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.match(source, /class-roster-modal/)
  assert.match(source, /class-roster-title/)
  assert.match(source, /등록 확인 필요/)
  assert.match(source, /잘못된 인원으로 합치지 않고 따로 보류했어요/)

  // Keep the existing React presence counter intact; the roster UI enhances it externally.
  assert.match(main, /className=\{`class-presence-count \$\{presence\.total > 0 \? 'is-ready' : ''\}`\}/)
  assert.match(main, /\{presence\.online\}\/\{presence\.total\}/)
})

test('roster orphan cleanup is authenticated, POST-only, and revalidates after an archive', () => {
  const source = read('src/class-roster-ui.js')

  assert.match(source, /CLASS_ROSTER_REPAIR_API_URL = 'https:\/\/school-reminder-backend\.vercel\.app\/api\/class-roster-repair'/)
  assert.match(source, /async function repairRosterIfNeeded\(\)/)
  assert.match(source, /if \(repairAttempted \|\| repairPromise \|\| !cachedRoster\?\.unresolved\) return null/)
  assert.match(source, /fetch\(CLASS_ROSTER_REPAIR_API_URL, \{[\s\S]*method: 'POST'/)
  assert.match(source, /Authorization: `Bearer \$\{idToken\}`/)
  assert.match(source, /if \(Number\(payload\?\.archived \|\| 0\) > 0\)/)
  assert.match(source, /await fetchRoster\(\{ force: true \}\)/)
})

test('first roster open avoids duplicate loading paint, forced pointer focus, and refresh animation replay', () => {
  const source = read('src/class-roster-ui.js')
  const css = read('src/class-roster.css')

  assert.match(source, /function scheduleModalWarmup\(\)/)
  assert.match(source, /requestIdleCallback/)
  assert.match(source, /if \(modal\.layer\.classList\.contains\('is-visible'\)\) return/)
  assert.match(source, /if \(cachedRoster\) renderRoster\(\{ animateRows: true, force: true \}\)\n  else renderRoster\(\{ loading: true \}\)/)
  assert.match(source, /void refreshModal\(\{ force: true, showLoading: false \}\)/)
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/)
  assert.doesNotMatch(source, /requestAnimationFrame\(\(\) => requestAnimationFrame/)
  assert.match(source, /if \(keyboard\) modal\.close\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /row\.className = `class-roster-row\$\{animate \? '' : ' is-static'\}`/)
  assert.match(css, /\.class-roster-row\.is-static[\s\S]*animation: none/)
})

test('class roster modal keeps restrained open-close motion and reduced-motion fallback', () => {
  const css = read('src/class-roster.css')

  assert.match(css, /\.class-roster-modal[\s\S]*transform: translate3d\(0, 13px, 0\) scale\(0\.982\)/)
  assert.match(css, /\.class-roster-layer\.is-open \.class-roster-modal[\s\S]*scale\(1\)/)
  assert.match(css, /animation: class-roster-row-in 460ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.class-roster-row[\s\S]*animation: none !important/)
})
