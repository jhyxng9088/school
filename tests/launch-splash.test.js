import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const bootstrap = fs.readFileSync(new URL('../src/app-bootstrap.jsx', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const setup = fs.readFileSync(new URL('../src/student-setup.jsx', import.meta.url), 'utf8')
const todo = fs.readFileSync(new URL('../src/todo.jsx', import.meta.url), 'utf8')
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
  assert.match(indexHtml, /manifest\.webmanifest\?v=13/)
  assert.match(indexHtml, /--shub-launch-bg:\s*#000000/)
  assert.match(indexHtml, /function resolveLaunchTheme\(\)/)
  assert.match(indexHtml, /getPropertyValue\('--bg'\)/)
  assert.match(indexHtml, /background-color 720ms/)
  assert.match(indexHtml, /splash\.style\.backgroundColor = targetBg/)
  assert.match(indexHtml, /requestAnimationFrame\(animateLaunchProgress\)/)
  assert.doesNotMatch(indexHtml, /setTimeout\(\(\) => paintLaunchProgress\(\.3\)/)
  assert.match(indexHtml, /name="shub-shell-version" content="14"/)
})

test('configured launch preloads fresh data before main app import', () => {
  assert.match(bootstrap, /preloadConfiguredAppData/)
  assert.match(bootstrap, /window\.__shubLaunchPreload = await preloadConfiguredAppData/)
  assert.match(preload, /preloadClassPresence/)
  assert.match(preload, /preloadClassRoster/)
  assert.match(preload, /preloadTimetable/)
  assert.match(preload, /preloadTodos/)
  assert.match(preload, /preloadSharedAcademic/)
  assert.match(preload, /preloadSchoolData/)
  assert.match(preload, /preloadPreviewBoard/)
  assert.match(preload, /preloadPreviewStudy/)
  assert.match(preload, /LAUNCH_PRELOAD_TIMEOUT_MS = 8500/)
  assert.doesNotMatch(main, /window\.setTimeout\(finish, 1800\)/)
  assert.match(main, /if \(appShellOwnsLaunch\) return undefined/)
})


test('launch shell cache advances so installed PWAs receive the new boot surface', () => {
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const deploymentRefresh = fs.readFileSync(new URL('../src/deployment-refresh.js', import.meta.url), 'utf8')
  assert.match(sw, /school-shell-v162-launch-motion/)
  assert.match(bootstrap, /registration\?\.update\(\)/)
  assert.match(deploymentRefresh, /meta\[name="shub-shell-version"\]/)
  assert.match(deploymentRefresh, /shellChanged/)
})


test('launch color follows the interpolated loading progress instead of switching immediately', () => {
  assert.match(indexHtml, /function launchThemeMix\(progress\)/)
  assert.match(indexHtml, /paintLaunchTheme\(launchState\.progressPainted\)/)
  assert.match(indexHtml, /paintLaunchProgress\(\.14\)/)
  assert.match(indexHtml, /getComputedStyle\(splash\)\.backgroundColor/)
  assert.doesNotMatch(indexHtml, /paintLaunchProgress\(\.5\)/)
})
