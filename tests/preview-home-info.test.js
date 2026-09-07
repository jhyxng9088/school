import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url))

test('V2 home overview directly reuses existing unread controllers and local app data', () => {
  const component = read('src/preview-home-signals.jsx')
  const main = read('src/main.jsx')
  const vite = read('vite.config.js')

  assert.match(component, /usePreviewBoardUnread\(profile\)/)
  assert.match(component, /subscribePreviewStudyUnread\(profile, setStudyUnread\)/)
  assert.match(component, /presence\?\.online/)
  assert.match(component, /activeReminderCount\(todos\)/)
  assert.doesNotMatch(component, /loadPreviewStudy\(/)
  assert.doesNotMatch(component, /loadPreviewBoard/)

  assert.match(main, /<PreviewHomeSignals profile=\{profile\} presence=\{presence\} todos=\{todoData\.todos\} onNavigate=\{onNavigate\} \/>/)
  assert.match(main, /function Home\(\{ profile, name, now/)
  assert.match(main, /onNavigate=\{navigateHomeSignal\}/)
  assert.match(main, /useHomeMealPriority\(now\)/)
  assert.equal(exists('src/preview-home-info-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewHomeInfoSource/)
  assert.doesNotMatch(vite, /preview-home-info-patch\.js/)
})

test('station navigation preserves source-owned Home profile and navigation props', () => {
  const source = patchPreviewStationNavSource(read('src/main.jsx'), '/workspace/src/main.jsx')
  assert.match(source, /<Home\n        profile=\{profile\}\n        onNavigate=\{navigateHomeSignal\}\n        name=\{name\}/)
})

test('V2 home overview remains compact as a 2 by 2 grid across mobile and larger layouts', () => {
  const css = read('src/preview-home-signals.css')

  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /html\.school-samsung \.preview-home-signal/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
