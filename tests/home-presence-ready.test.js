import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const signals = fs.readFileSync(new URL('../src/preview-home-signals.jsx', import.meta.url), 'utf8')
const signalStyles = fs.readFileSync(new URL('../src/preview-home-signals.css', import.meta.url), 'utf8')
const sync = fs.readFileSync(new URL('../src/school-sync.js', import.meta.url), 'utf8')

test('Home school data follows the active student profile so NEIS closures use the right school', () => {
  assert.match(main, /const schoolData = useSchoolData\(now, profile\)/)
  assert.doesNotMatch(main, /const schoolData = useSchoolData\(now\)\n/)
})

test('presence is visible only after the canonical presence owner is explicitly ready', () => {
  assert.match(main, /const presenceReady = presence\?\.ready === true/)
  assert.match(signals, /const presenceReady = presence\?\.ready === true/)
  assert.doesNotMatch(main, /presence\?\.ready !== false/)
  assert.doesNotMatch(signals, /presence\?\.ready !== false/)
})

test('pending home realtime values keep their layout but never expose dash placeholders', () => {
  assert.match(signalStyles, /\.preview-home-signal\.is-pending strong,[\s\S]*visibility: hidden;[\s\S]*opacity: 0;/)
})


test('fresh cached presence can release repeat launch while live transport revalidates in background', () => {
  assert.match(sync, /return \{ online, total, ready: true, liveReady: false, totalReady: false, launchCachedReady: true \}/)
  assert.match(sync, /launchCachedReady: false/)
  assert.match(sync, /const next = \{ \.\.\.current, online, ready: true, liveReady: true \}/)
  assert.match(sync, /const next = \{ \.\.\.current, total: cached, totalReady: true \}/)
  assert.match(signals, /presence\?\.launchCachedReady === true[\s\S]*presence\?\.liveReady === true && presence\?\.totalReady === true/)
})
