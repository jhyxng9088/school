import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/unified-sheet.jsx', import.meta.url), 'utf8')

test('installed iOS PWA avoids fixed-body sheet scroll lock so the status area fades with the backdrop', () => {
  const helper = source.slice(
    source.indexOf('function needsFixedBodyScrollLock()'),
    source.indexOf('export function UnifiedBottomSheet'),
  )

  assert.match(helper, /display-mode: standalone/)
  assert.match(helper, /navigator\.standalone === true/)
  assert.match(helper, /return iOSLike && !standalone/)
})

test('browser iOS keeps the legacy fixed-body fallback while overflow lock remains the alternate path', () => {
  assert.match(source, /if \(fixedBodyScrollLock\) \{[\s\S]*body\.style\.position = 'fixed'/)
  assert.match(source, /else \{[\s\S]*root\.style\.overflow = 'hidden'[\s\S]*body\.style\.overflow = 'hidden'/)
})
