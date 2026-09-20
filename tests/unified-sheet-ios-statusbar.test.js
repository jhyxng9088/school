import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/unified-sheet.jsx', import.meta.url), 'utf8')
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('iOS sheets keep the canonical fixed-body scroll lock', () => {
  const helper = source.slice(
    source.indexOf('function needsFixedBodyScrollLock()'),
    source.indexOf('export function UnifiedBottomSheet'),
  )

  assert.match(helper, /iPhone\|iPad\|iPod/)
  assert.doesNotMatch(helper, /display-mode: standalone/)
  assert.doesNotMatch(helper, /navigator\.standalone/)
  assert.match(source, /if \(fixedBodyScrollLock\) \{[\s\S]*body\.style\.position = 'fixed'/)
})

test('installed iOS puts the status area on the same backdrop canvas without moving content upward', () => {
  assert.match(index, /apple-mobile-web-app-status-bar-style" content="black-translucent"/)
  assert.match(index, /root\.classList\.add\('school-ios-standalone'\)/)
  assert.match(styles, /html\.school-ios-standalone \.app-content \{[\s\S]*padding-top: calc\(env\(safe-area-inset-top, 0px\) \+ 32px\)/)
})
