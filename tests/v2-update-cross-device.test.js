import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('device routing keeps iPhone/Android/Samsung mobile paths separate from desktop and excludes iPad desktop UA', () => {
  const index = read('index.html')
  const main = read('src/main.jsx')

  assert.match(index, /mobileBrowser = \/iPhone\|iPod\|Android\|SamsungBrowser\/i/)
  assert.match(index, /iPadDesktopUA = \/Macintosh\/i\.test\(ua\) && navigator\.maxTouchPoints > 1/)
  assert.match(index, /if \(!mobileBrowser && !iPadDesktopUA && finePointer\)/)
  assert.match(main, /MOBILE_BROWSER_COMPAT = \/iPhone\|iPod\|Android\|SamsungBrowser\/i/)
  assert.match(main, /SAMSUNG_BROWSER = \/SamsungBrowser\/i/)
  assert.match(main, /document\.documentElement\.classList\.add\('school-mobile-compat'\)/)
  assert.match(main, /document\.documentElement\.classList\.add\('school-samsung'\)/)
})

test('V2 tour stays inside mobile/tablet viewports and provides a short-landscape fallback', () => {
  const base = read('public/first-run-notice.css')
  const device = read('public/v2-update-device-fixes.css')

  assert.match(base, /padding:[\s\S]*env\(safe-area-inset-top\)[\s\S]*env\(safe-area-inset-right\)[\s\S]*env\(safe-area-inset-bottom\)[\s\S]*env\(safe-area-inset-left\)/)
  assert.match(base, /width:\s*min\(100%, 520px\)/)
  assert.match(base, /height:\s*min\(724px, calc\(100dvh/)
  assert.match(device, /@media \(max-width: 420px\)/)
  assert.match(device, /@media \(max-height: 560px\)/)
  assert.match(device, /\.v2-update-tour-layer \{[\s\S]*overscroll-behavior:\s*none;/)
  assert.match(device, /\.feature-tour-viewport \{[\s\S]*overscroll-behavior:\s*contain;/)
})

test('desktop keeps horizontal overflow clipped and V2 overlay cannot cause scrollbar/nav jumps', () => {
  const desktop = read('src/desktop-motion.css')
  const device = read('public/v2-update-device-fixes.css')

  assert.match(desktop, /scrollbar-gutter:\s*stable both-edges;/)
  assert.match(desktop, /overflow-x:\s*clip;/)
  assert.match(desktop, /overflow-y:\s*scroll;/)
  assert.match(device, /html\.school-desktop-laptop:has\(\.v2-update-tour-layer\)/)
  assert.match(device, /overflow-y:\s*hidden;/)
  assert.match(device, /scrollbar-gutter:\s*stable both-edges;/)
  assert.match(device, /school-desktop-laptop:has\(\.v2-update-tour-layer\) body[\s\S]*overflow-y:\s*hidden;/)
})

test('V2 nav animation uses Safari/Chromium-safe explicit offsets instead of typed calc multiplication', () => {
  const device = read('public/v2-update-device-fixes.css')

  assert.match(device, /--v2-nav-step-1:\s*calc\(100% \+ 6px\)/)
  assert.match(device, /--v2-nav-step-4:\s*calc\(400% \+ 24px\)/)
  assert.match(device, /width:\s*calc\(\(100% - 24px\) \/ 5\)/)
  assert.doesNotMatch(device, /var\(--v2-nav-gap\)\s*\*/)
  assert.doesNotMatch(device, /var\(--v2-order\)\s*\*/)
})
