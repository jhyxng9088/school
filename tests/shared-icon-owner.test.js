import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'
import { patchSharedSegmentSpringOwnerSource } from '../src/shared-segment-spring-owner-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared S-Hub icon registry preserves every app icon and the polished study book', () => {
  const source = read('src/s-hub-icon.jsx')
  for (const name of ['home', 'class', 'ai', 'study', 'schedule', 'board', 'todo', 'timetable', 'meal', 'academic', 'search', 'clock']) {
    assert.match(source, new RegExp(`name === '${name}'`))
  }
  assert.match(source, /M2\.8 5\.2c3\.6-\.9 6\.7\.1 9\.2 2\.8/)
  assert.match(source, /M21\.2 5\.2c-3\.6-\.9-6\.7\.1-9\.2 2\.8/)
  assert.match(source, /M12 8v11\.2/)
})

test('main source directly owns the shared icon wrapper before any Vite transform', () => {
  const source = read('src/main.jsx')
  assert.match(source, /import \{ SHubIcon \} from '\.\/s-hub-icon\.jsx'/)
  assert.match(source, /function Icon\(\{ type, size = 22 \}\) \{\n  return <SHubIcon name=\{type\} size=\{size\} \/>\n\}/)

  const start = source.indexOf('function Icon({ type, size = 22 }) {')
  const end = source.indexOf('function InstallGuide', start)
  assert.ok(start >= 0 && end > start)
  const iconBlock = source.slice(start, end)
  assert.doesNotMatch(iconBlock, /<svg/)
  assert.doesNotMatch(iconBlock, /M2\.8 5\.2/)
})

test('station and study transforms preserve the source-owned icon wrapper', () => {
  const id = '/workspace/src/main.jsx'
  let source = read('src/main.jsx')
  source = patchPreviewStationNavSource(source, id)
  source = patchStudyVisualPolishSource(source, id)
  source = patchSharedSegmentSpringOwnerSource(source, id)

  assert.match(source, /function Icon\(\{ type, size = 22 \}\) \{\n  return <SHubIcon name=\{type\} size=\{size\} \/>\n\}/)
  const start = source.indexOf('function Icon({ type, size = 22 }) {')
  const end = source.indexOf('function InstallGuide', start)
  const iconBlock = source.slice(start, end)
  assert.doesNotMatch(iconBlock, /<svg/)
  assert.doesNotMatch(source, /M4\.2 5\.1h5\.5/)
})

test('Vite calls the shared segment spring owner directly after visual polish', () => {
  const vite = read('vite.config.js')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  const shared = vite.indexOf('patchSharedSegmentSpringOwnerSource(next, cleanId)')
  assert.ok(visual >= 0)
  assert.ok(shared > visual)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\.js/)
  assert.equal(fs.existsSync(new URL('../src/shared-icon-owner-patch.js', import.meta.url)), false)
})
