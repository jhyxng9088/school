import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const patch = fs.readFileSync(new URL('../src/preview-station-nav-refine-patch.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('expanded class station redistributes the other four slots evenly', () => {
  assert.match(patch, /--class-open-width:/)
  assert.match(patch, /--station-side-slot:/)
  assert.match(patch, /grid-template-columns:\s*var\(--station-side-slot\)\s*var\(--class-open-width\)/)
  assert.match(patch, /transition: grid-template-columns 620ms/)
})

test('leaving class collapses first and changes station only after settling', () => {
  assert.match(patch, /classNavCollapsing/)
  assert.match(patch, /setClassNavExpanded\(false\)/)
  assert.match(patch, /setClassNavCollapsing\(true\)/)
  assert.match(patch, /classExitTimerRef\.current = window\.setTimeout/)
  assert.match(patch, /}, 520\)/)
  assert.match(patch, /commitStationTab\(target\)/)
})

test('class capsule stays visible while folding back into the ordinary pill', () => {
  assert.match(patch, /\.bottom-nav\.is-class-collapsing \.class-nav-capsule/)
  assert.match(patch, /opacity: 1/)
  assert.match(patch, /\.bottom-nav\.is-class-collapsing \.nav-button\[data-tab="class"\]/)
})

test('nested icons are compositor-stable to prevent board icon flicker', () => {
  assert.match(patch, /-webkit-tap-highlight-color: transparent/)
  assert.match(patch, /backface-visibility: hidden/)
  assert.match(patch, /\.class-nav-subbutton svg \{/)
  assert.match(patch, /opacity: 1 !important/)
  assert.match(patch, /transition: none !important/)
})

test('preview vite applies refinement after the base station patch', () => {
  const base = vite.indexOf('next = patchPreviewStationNavSource(next, cleanId)')
  const refine = vite.indexOf('next = patchPreviewStationNavRefinementSource(next, cleanId)')
  assert.ok(base >= 0)
  assert.ok(refine > base)
  assert.match(vite, /preview-station-nav-refine-patch\.js/)
})
