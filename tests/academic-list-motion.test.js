import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../public/academic-list-motion.css', import.meta.url), 'utf8')

test('academic list motion stylesheet is loaded', () => {
  assert.match(index, /\.\/academic-list-motion\.css/)
})

test('academic list surface matches reminder page-entry motion', () => {
  assert.match(css, /\.academic-page > \.academic-list\s*\{/)
  assert.match(css, /animation: school-page-piece-in 1040ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both/)
  assert.match(css, /animation-delay: 275ms/)
})

test('academic list motion keeps mobile and reduced-motion behavior', () => {
  assert.match(css, /html\.school-mobile-compat \.academic-page > \.academic-list/)
  assert.match(css, /animation-duration: 760ms/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation-duration: 0\.01ms !important/)
})
