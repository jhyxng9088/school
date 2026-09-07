import fs from 'node:fs'

const files = [
  'tests/preview-board.test.js',
  'tests/preview-class-top-segment.test.js',
  'tests/preview-nav-responsiveness.test.js',
  'tests/preview-nested-geometry-coupling.test.js',
  'tests/preview-physical-class-coupling.test.js',
  'tests/preview-unified-station-physics.test.js',
]

const importLine = "import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'\n"
const applyLine = '  source = patchPreviewNavSpringSource(source, id)\n'

for (const path of files) {
  let source = fs.readFileSync(path, 'utf8')
  const importCount = source.split(importLine).length - 1
  const applyCount = source.split(applyLine).length - 1
  if (importCount !== 1 || applyCount !== 1) {
    throw new Error(`nav spring test retarget: ${path} expected one import/apply pair, found ${importCount}/${applyCount}`)
  }
  source = source.replace(importLine, '').replace(applyLine, '')
  fs.writeFileSync(path, source)
}
