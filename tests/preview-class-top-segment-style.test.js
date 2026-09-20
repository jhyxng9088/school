import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewClassTopSegmentSource } from '../src/preview-class-top-segment-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

test('class top segment parent owns the final centered thin geometry', () => {
  const source = patchPreviewClassTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(source, /height: 44px !important/)
  assert.match(source, /margin: 2px auto 18px !important/)
  assert.match(source, /min-height: 34px !important/)
})

test('class top segment parent owns the exact bottom nav indicator material tokens', () => {
  const source = patchPreviewClassTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(source, /\.class-top-segment-pill \{[\s\S]*background: var\(--nav-indicator-surface\) !important/)
  assert.match(source, /opacity: 1 !important/)
  assert.match(source, /inset 0 1px 0 var\(--specular-edge\)/)
  assert.match(source, /inset 0 0 0 0\.75px var\(--nav-indicator-edge\)/)
  assert.match(source, /var\(--nav-indicator-shadow\) !important/)
})

test('class segment parent keeps the home current-class description readable', () => {
  const source = patchPreviewClassTopSegmentSource('', '/workspace/src/styles.css')
  assert.match(source, /\.current-class-copy > p:last-child \{[\s\S]*max-width: 440px !important/)
  assert.match(source, /word-break: keep-all/)
  assert.match(source, /overflow-wrap: break-word/)
})

test('class segment parent owns board-first order and bottom-nav spring motion directly', () => {
  const source = read('src/preview-class-top-segment-patch.js')
  const component = source.slice(
    source.indexOf('function ClassTopSegment'),
    source.indexOf('function ClassStationPage'),
  )
  assert.match(component, /const activeIndex = section === 'timetable' \? 1 : 0/)
  assert.match(component, /useSHubSegmentSpring\(activeIndex/)
  assert.match(component, /deform: true/)
  assert.match(component, /shellElastic: false/)
  assert.match(component, /ref=\{spring\.containerRef\}/)
  assert.match(component, /ref=\{spring\.indicatorRef\}/)
  assert.match(component, /spring\.buttonRefs\.current\[index\]/)
  assert.doesNotMatch(source, /transition: transform 440ms cubic-bezier/)
  assert.ok(source.indexOf("{ id: 'board', label: '게시판' }") < source.indexOf("{ id: 'timetable', label: '시간표' }"))
  assert.match(source, /setClassSection\] = useState\('timetable'\)[\s\S]*setClassSection\] = useState\('board'\)/)
})

test('downstream class segment style build owner is retired', () => {
  const vite = read('vite.config.js')
  assert.equal(exists('src/preview-class-top-segment-style-patch.js'), false)
  assert.doesNotMatch(vite, /patchPreviewClassTopSegmentStyleSource/)
  assert.doesNotMatch(vite, /preview-class-top-segment-style-patch\.js/)
  assert.match(vite, /patchPreviewClassTopSegmentSource\(next, cleanId\)/)
})
