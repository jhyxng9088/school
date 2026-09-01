import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('V2 home overview reuses existing unread controllers and local app data', () => {
  const component = read('src/preview-home-signals.jsx')
  const patch = read('src/preview-home-info-patch.js')
  const vite = read('vite.config.js')

  assert.match(component, /usePreviewBoardUnread\(profile\)/)
  assert.match(component, /subscribePreviewStudyUnread\(profile, setStudyUnread\)/)
  assert.match(component, /presence\?\.online/)
  assert.match(component, /activeReminderCount\(todos\)/)
  assert.doesNotMatch(component, /loadPreviewStudy\(/)
  assert.doesNotMatch(component, /loadPreviewBoard/)

  assert.match(patch, /<PreviewHomeSignals profile=\{profile\} presence=\{presence\} todos=\{todoData\.todos\} onNavigate=\{onNavigate\} \/>/)
  assert.match(patch, /function Home\(\{ profile, name, now/)
  assert.match(patch, /onNavigate=\{navigateHomeSignal\}/)
  assert.match(vite, /patchPreviewHomeInfoSource/)
})

test('V2 home overview remains compact across mobile and larger layouts', () => {
  const css = read('src/preview-home-signals.css')

  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media \(min-width: 760px\)[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /html\.school-samsung \.preview-home-signal/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
