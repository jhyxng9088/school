import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('desktop tab layout reserves scrollbar space even at phone-like window widths without changing mobile paths', () => {
  const css = read('src/desktop-motion.css')
  const sheet = read('src/unified-sheet.jsx')

  assert.match(sheet, /import '\.\/desktop-motion\.css'/)
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/)
  assert.doesNotMatch(css, /min-width:\s*700px/)
  assert.match(css, /html:not\(\.school-mobile-compat\)\.school-desktop-laptop/)
  assert.match(css, /scrollbar-gutter:\s*stable both-edges;/)
  assert.match(css, /@supports not \(scrollbar-gutter: stable\)/)
  assert.match(css, /overflow-y:\s*scroll;/)
})

test('unified sheets keep fixed-body locking for iOS and use overflow locking elsewhere', () => {
  const sheet = read('src/unified-sheet.jsx')

  assert.match(sheet, /function needsFixedBodyScrollLock\(\)/)
  assert.match(sheet, /iPhone\|iPad\|iPod/)
  assert.match(sheet, /Macintosh[\s\S]*navigator\.maxTouchPoints > 1/)
  assert.match(sheet, /if \(fixedBodyScrollLock\) \{[\s\S]*body\.style\.position = 'fixed'/)
  assert.match(sheet, /else \{[\s\S]*root\.style\.overflow = 'hidden'[\s\S]*body\.style\.overflow = 'hidden'/)
  assert.match(sheet, /if \(fixedBodyScrollLock\) window\.scrollTo\(0, scrollY\)/)
})
