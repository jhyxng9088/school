import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewStationNavSource } from '../src/preview-station-nav-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'
import { patchSharedIconOwnerSource } from '../src/shared-icon-owner-patch.js'

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

test('visual polish no longer rewrites the station study SVG before SHubIcon takes ownership', () => {
  const id = '/workspace/src/main.jsx'
  let source = read('src/main.jsx')
  source = patchPreviewStationNavSource(source, id)
  assert.match(source, /M4\.2 5\.1h5\.5/)

  const polished = patchStudyVisualPolishSource(source, id)
  assert.equal(polished, source)

  const owned = patchSharedIconOwnerSource(polished, id)
  assert.match(owned, /import \{ SHubIcon \} from '\.\/s-hub-icon\.jsx'/)
  assert.match(owned, /function Icon\(\{ type, size = 22 \}\) \{\n  return <SHubIcon name=\{type\} size=\{size\} \/>\n\}/)
  const start = owned.indexOf('function Icon({ type, size = 22 }) {')
  const end = owned.indexOf('function InstallGuide', start)
  assert.ok(start >= 0 && end > start)
  const iconBlock = owned.slice(start, end)
  assert.doesNotMatch(iconBlock, /<svg/)
})

test('shared icon owner is the final V2 source transform after visual polish', () => {
  const vite = read('vite.config.js')
  const visual = vite.indexOf('patchStudyVisualPolishSource(next, cleanId)')
  const shared = vite.indexOf('patchSharedIconOwnerSource(next, cleanId)')
  assert.ok(visual >= 0)
  assert.ok(shared > visual)
})
