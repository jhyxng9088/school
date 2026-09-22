import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const bootstrap = fs.readFileSync(new URL('../src/app-bootstrap.jsx', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const setup = fs.readFileSync(new URL('../src/student-setup.jsx', import.meta.url), 'utf8')
const todo = fs.readFileSync(new URL('../src/todo.jsx', import.meta.url), 'utf8')
const previewHomeSignals = fs.readFileSync(new URL('../src/preview-home-signals.jsx', import.meta.url), 'utf8')
const preload = fs.readFileSync(new URL('../src/launch-data-preload.js', import.meta.url), 'utf8')
const manifest = fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')

test('launch splash renders before React root with canonical S-Hub logo', () => {
  const splashAt = indexHtml.indexOf('id="shub-launch-splash"')
  const rootAt = indexHtml.indexOf('id="root"')
  assert.ok(splashAt >= 0)
  assert.ok(rootAt > splashAt)
  assert.match(indexHtml, /src="\.\/icon\.svg\?v=9"/)
  assert.match(indexHtml, /id="shub-launch-progress-fill"/)
  assert.doesNotMatch(indexHtml, /shub-launch-silver/)
})

test('bootstrap and app only complete splash after app startup', () => {
  assert.match(bootstrap, /__shubLaunch\?\.progress/)
  assert.match(bootstrap, /__shubLaunch\?\.ready/)
  assert.match(main, /__shubLaunch\?\.ready/)
})

test('student onboarding has one canonical owner', () => {
  assert.match(main, /import \{ StudentSetup \} from '\.\/student-setup\.jsx'/)
  assert.doesNotMatch(main, /function StudentSetup\(/)
  assert.match(setup, /S-Hub 시작하기/)
  assert.match(setup, /setup-feature-grid/)
  assert.match(setup, /학교와 내 정보를 연결해/)
})


test('native launch starts black and morphs into the resolved saved theme', () => {
  const parsed = JSON.parse(manifest)
  assert.equal(parsed.background_color, '#000000')
  assert.equal(parsed.theme_color, '#000000')
  assert.match(indexHtml, /id="shub-theme-color" name="theme-color" content="#000000"/)
  assert.match(indexHtml, /manifest\.webmanifest\?v=21/)
  assert.match(indexHtml, /--shub-launch-bg:\s*#000000/)
  assert.match(indexHtml, /function resolveLaunchTheme\(\)/)
  assert.match(indexHtml, /getPropertyValue\('--bg'\)/)
  assert.match(indexHtml, /function launchThemeMix\(progress\)/)
  assert.match(indexHtml, /splash\.style\.backgroundColor = mixedBg/)
  assert.match(indexHtml, /requestAnimationFrame\(animateLaunchProgress\)/)
  assert.match(indexHtml, /version: 21/)
  assert.doesNotMatch(indexHtml, /setTimeout\(\(\) => paintLaunchProgress\(\.3\)/)
  assert.match(indexHtml, /name="shub-shell-version" content="21"/)
})

test('configured launch mounts canonical owners immediately but reveals only after a stable Home paint, including holiday layout', () => {
  assert.match(bootstrap, /const mainModulePromise = preloadMainAppModule\(\)/)
  assert.doesNotMatch(bootstrap, /preloadConfiguredAppData/)
  assert.doesNotMatch(bootstrap, /__shubLaunchPreload/)
  assert.match(bootstrap, /const mainModule = await mainModulePromise/)
  assert.match(bootstrap, /mainModule\.mountMainApp\(\)/)
  assert.match(main, /export function mountMainApp\(\)/)
  assert.match(main, /const launchHomeSurfaceRef = useRef\(null\)/)
  assert.match(main, /launchReady: timetableLaunchReady/)
  assert.match(main, /const launchHomeReady = presence\?\.ready === true[\s\S]*homeSignalsReady === true[\s\S]*todoData\.ready === true[\s\S]*timetableLaunchReady === true/)
  assert.match(main, /const surfaces = stack\.querySelectorAll/)
  assert.match(main, /\.current-class-card, \.preview-home-signals, \.todo-home-preview, \.academic-preview, \.home-timetable-preview, \.meal-preview/)
  assert.match(main, /surfaces\.length < 5/)
  assert.match(main, /stack\.closest\('\.app-content\.tab-home'\)/)
  assert.match(main, /stablePaintFrames < 2/)
  assert.match(main, /launch\.ready\?\.\(\{ settleMs: 24 \}\)/)
  assert.match(main, /window\.setTimeout\(requestFinishAfterPaint, 2000\)/)
  assert.match(main, /launchSurfaceRef=\{launchHomeSurfaceRef\}/)
  assert.match(main, /onSignalsReadyChange=\{setHomeSignalsReady\}/)
  assert.match(previewHomeSignals, /const launchReady = presence\?\.liveReady === true && studyUnread\?\.syncedThisLaunch === true/)
  assert.match(previewHomeSignals, /onLaunchReadyChange\?\.\(launchReady\)/)
  assert.match(main, /if \(appShellOwnsLaunch\) return undefined/)
})


test('launch shell cache advances so installed PWAs receive the new boot surface', () => {
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const deploymentRefresh = fs.readFileSync(new URL('../src/deployment-refresh.js', import.meta.url), 'utf8')
  assert.match(sw, /school-shell-v169-ios-system-topbar/)
  assert.match(bootstrap, /registration\?\.update\(\)/)
  assert.match(deploymentRefresh, /meta\[name="shub-shell-version"\]/)
  assert.match(deploymentRefresh, /shellChanged/)
})


test('launch color and bar move continuously between data milestones', () => {
  assert.match(indexHtml, /function launchThemeMix\(progress\)/)
  assert.match(indexHtml, /progressPainted: 0\.015/)
  assert.match(indexHtml, /const continuous = launchState\.progressPainted \+ \(delta \* \(finalizing \? \.00004 : \.000012\)\)/)
  assert.match(indexHtml, /const cap = finalizing \? 1 : \.94/)
  assert.match(indexHtml, /paintLaunchTheme\(launchState\.progressPainted\)/)
  assert.match(indexHtml, /Math\.abs\(mix - launchState\.lastThemeColorMix\) >= \.025/)
  assert.match(indexHtml, /paintLaunchProgress\(\.14\)/)
  assert.match(indexHtml, /--shub-system-bg/)
  assert.match(indexHtml, /themeColor\.setAttribute\('content', launchState\.targetBg\)/)
  assert.doesNotMatch(indexHtml, /root\.style\.backgroundColor = mixedBg/)
  assert.doesNotMatch(indexHtml, /document\.body\.style\.backgroundColor = mixedBg/)
  assert.doesNotMatch(indexHtml, /paintLaunchProgress\(\.5\)/)
})


test('failed launch sources do not hold the app behind long retry backoff', () => {
  assert.match(preload, /const delays = \[0, 90\]/)
  assert.doesNotMatch(preload, /140|220|720/)
})


test('fresh iOS installs keep the stable status-bar layout while launch origins stay warm', () => {
  assert.match(indexHtml, /apple-mobile-web-app-status-bar-style" content="default"/)
  assert.doesNotMatch(indexHtml, /school-ios-standalone/)
  assert.match(indexHtml, /elhlsqhzjmsfhmawrpqu\.supabase\.co/)
  assert.match(indexHtml, /open\.neis\.go\.kr/)
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(styles, /school-ios-standalone \.app-shell::before/)
  assert.match(styles, /\.app-content \{[\s\S]*padding: max\(32px, env\(safe-area-inset-top\)\)/)
})


test('synced theme can retarget the active launch surface', () => {
  assert.match(indexHtml, /function refreshLaunchTheme\(\)/)
  assert.match(indexHtml, /refreshTheme: refreshLaunchTheme/)
})


test('theme preference sync no longer blocks school-data launch hydration', () => {
  assert.doesNotMatch(preload, /preloadThemePreferences/)
  assert.doesNotMatch(preload, /label: 'theme'/)
})


test('auth revalidation starts before the main app mounts', () => {
  const warmAt = bootstrap.indexOf('void ensureSignedIn().catch')
  const mainLoadAt = bootstrap.indexOf('const mainModulePromise = preloadMainAppModule()')
  assert.ok(warmAt >= 0)
  assert.ok(mainLoadAt > warmAt)
})

test('service worker refresh tolerates a missing registration object', () => {
  assert.match(main, /registration\?\.update\?\.\(\)\.catch\(\(\) => \{\}\)/)
})


test('launch avoids duplicate hydration and crossfades only after real Home layout is paintable', () => {
  assert.doesNotMatch(indexHtml, /modulepreload" href="\/src\/launch-data-preload\.js"/)
  assert.match(indexHtml, /opacity 280ms/)
  assert.match(indexHtml, /visibility 0s linear 280ms/)
  assert.match(indexHtml, /html\.shub-launch-handoff #root/)
  assert.match(indexHtml, /function beginLaunchHandoff\(\)/)
  assert.match(indexHtml, /progressPainted < \.985 && elapsed < 190/)
  assert.match(indexHtml, /function finishLaunch\(\{ settleMs = 60 \} = \{\}\)/)
  assert.match(main, /homeSurfaceHasPaintableLayout/)
  assert.match(main, /getBoundingClientRect\(\)/)
  assert.match(main, /Array\.from\(surfaces\)\.every/)
  assert.match(main, /stablePaintFrames \+= 1/)
  assert.match(main, /launch\.ready\?\.\(\{ settleMs: 24 \}\)/)
  assert.match(main, /window\.setTimeout\(requestFinishAfterPaint, 2000\)/)
})


test('launch keeps secondary Home sources in the background while priority state is bounded', () => {
  const timetable = fs.readFileSync(new URL('../src/timetable.js', import.meta.url), 'utf8')
  const sync = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')
  assert.match(timetable, /export function hasStoredWeeklySchedule\(\)/)
  assert.match(sync, /useState\(\(\) => hasStoredWeeklySchedule\(\)\)/)
  assert.match(sync, /setSharedLaunchReady\(true\)/)
  assert.match(sync, /launchReady: sharedLaunchReady && personalLaunchReady/)
  assert.match(main, /window\.setTimeout\(requestFinishAfterPaint, 2000\)/)
  const gateAt = main.indexOf('const launchHomeReady =')
  const gate = main.slice(gateAt, main.indexOf('\n\n  useEffect', gateAt))
  assert.match(gate, /presence\?\.ready === true/)
  assert.match(gate, /homeSignalsReady === true/)
  assert.doesNotMatch(gate, /board|academic|meal/)
})
