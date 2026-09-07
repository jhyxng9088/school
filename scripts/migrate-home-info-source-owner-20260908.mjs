import fs from 'node:fs'
import { patchPreviewHomeInfoSource } from '../src/preview-home-info-patch.js'

function replaceOnce(source, marker, replacement, label) {
  const first = source.indexOf(marker)
  if (first < 0 || source.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`${label}: expected exactly one match`)
  }
  return source.replace(marker, replacement)
}

const mainPath = 'src/main.jsx'
const main = fs.readFileSync(mainPath, 'utf8')
const sourceOwnedMain = patchPreviewHomeInfoSource(main, '/workspace/src/main.jsx')
if (sourceOwnedMain === main) throw new Error('home info patch did not change raw main source')
fs.writeFileSync(mainPath, sourceOwnedMain)

// station-nav owns the broad content object rewrite. Preserve source-owned Home
// props instead of silently dropping them when that earlier owner runs.
const stationNavPath = 'src/preview-station-nav-patch.js'
let stationNav = fs.readFileSync(stationNavPath, 'utf8')
stationNav = replaceOnce(
  stationNav,
  "  const contentReplacement = `  const content = {\\n    home: (\\n      <Home\\n        name={name}\\n",
  "  const contentReplacement = `  const content = {\\n    home: (\\n      <Home\\n${next.includes('onNavigate={navigateHomeSignal}') ? '        profile={profile}\\\\n        onNavigate={navigateHomeSignal}\\\\n' : ''}        name={name}\\n",
  'station nav source-owned Home prop preservation',
)
fs.writeFileSync(stationNavPath, stationNav)

const vitePath = 'vite.config.js'
let vite = fs.readFileSync(vitePath, 'utf8')
vite = replaceOnce(vite, "import { patchPreviewHomeInfoSource } from './src/preview-home-info-patch.js'\n", '', 'vite home info import')
vite = replaceOnce(vite, '  next = patchPreviewHomeInfoSource(next, cleanId)\n', '', 'vite home info call')
vite = replaceOnce(vite, "        || cleanId.endsWith('/preview-home-info-patch.js')\n", '', 'vite home info polite exclusion')
fs.writeFileSync(vitePath, vite)

const effectPath = 'tests/build-patch-effect.test.js'
let effect = fs.readFileSync(effectPath, 'utf8')
effect = replaceOnce(
  effect,
  "  ['patchPreviewHomeInfoSource', 'preview-home-info-patch.js'],\n",
  '',
  'build effect home info owner',
)
fs.writeFileSync(effectPath, effect)

fs.writeFileSync('tests/preview-home-info.test.js', `import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'

const read = (path) => readFileSync(new URL(\`../\${path}\`, import.meta.url), 'utf8')
const exists = (path) => existsSync(new URL(\`../\${path}\`, import.meta.url))

test('V2 home overview directly reuses existing unread controllers and local app data', () => {
  const component = read('src/preview-home-signals.jsx')
  const main = read('src/main.jsx')
  const vite = read('vite.config.js')

  assert.match(component, /usePreviewBoardUnread\\(profile\\)/)
  assert.match(component, /subscribePreviewStudyUnread\\(profile, setStudyUnread\\)/)
  assert.match(component, /presence\\?\\.online/)
  assert.match(component, /activeReminderCount\\(todos\\)/)
  assert.doesNotMatch(component, /loadPreviewStudy\\(/)
  assert.doesNotMatch(component, /loadPreviewBoard/)

  assert.match(main, /<PreviewHomeSignals profile=\\{profile\\} presence=\\{presence\\} todos=\\{todoData\\.todos\\} onNavigate=\\{onNavigate\\} \\/>/)
  assert.match(main, /function Home\\(\\{ profile, name, now/)
  assert.match(main, /onNavigate=\\{navigateHomeSignal\\}/)
  assert.match(main, /useHomeMealPriority\\(now\\)/)
  assert.equal(exists('src/preview-home-info-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewHomeInfoSource/)
  assert.doesNotMatch(vite, /preview-home-info-patch\\.js/)
})

test('station navigation preserves source-owned Home profile and navigation props', () => {
  const source = patchPreviewStationNavSource(read('src/main.jsx'), '/workspace/src/main.jsx')
  assert.match(source, /<Home\\n        profile=\\{profile\\}\\n        onNavigate=\\{navigateHomeSignal\\}\\n        name=\\{name\\}/)
})

test('V2 home overview remains compact as a 2 by 2 grid across mobile and larger layouts', () => {
  const css = read('src/preview-home-signals.css')

  assert.match(css, /grid-template-columns: repeat\\(2, minmax\\(0, 1fr\\)\\)/)
  assert.doesNotMatch(css, /grid-template-columns: repeat\\(4, minmax\\(0, 1fr\\)\\)/)
  assert.match(css, /html\\.school-samsung \\.preview-home-signal/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
`)

const finalPath = 'tests/final-runtime-owner.test.js'
let finalTest = fs.readFileSync(finalPath, 'utf8')
finalTest = replaceOnce(finalTest, "  const homeInfo = read('src/preview-home-info-patch.js')\n", '', 'final home info source read')
finalTest = replaceOnce(
  finalTest,
  "  assert.doesNotMatch(homeInfo, /installPoliteCopyRuntime/)\n  assert.doesNotMatch(homeInfo, /polite-copy-runtime\\.js/)\n",
  "  assert.match(main, /import \\{ PreviewHomeSignals \\} from '\\.\\/preview-home-signals\\.jsx'/)\n  assert.match(main, /import \\{ HomeNavAction \\} from '\\.\\/home-nav-action\\.jsx'/)\n  assert.match(main, /import \\{ useHomeMealPriority \\} from '\\.\\/home-meal-priority\\.js'/)\n",
  'final source-owned home imports',
)
finalTest = replaceOnce(
  finalTest,
  "  assert.match(homeInfo, /SOURCE_ROSTER_IMPORT/)\n",
  "  assert.equal(exists('src/preview-home-info-patch.js'), false)\n",
  'final retired home patch absence',
)
finalTest = replaceOnce(
  finalTest,
  "  assert.equal(exists('src/preview-ai-background-patch.js'), false)\n",
  "  assert.equal(exists('src/preview-ai-background-patch.js'), false)\n  assert.equal(exists('src/preview-home-info-patch.js'), false)\n",
  'final retired home build owner list',
)
finalTest = replaceOnce(
  finalTest,
  "  assert.doesNotMatch(vite, /preview-ai-background-patch\\.js/)\n",
  "  assert.doesNotMatch(vite, /preview-ai-background-patch\\.js/)\n  assert.doesNotMatch(vite, /patchPreviewHomeInfoSource/)\n  assert.doesNotMatch(vite, /preview-home-info-patch\\.js/)\n",
  'final home vite guard',
)
fs.writeFileSync(finalPath, finalTest)
