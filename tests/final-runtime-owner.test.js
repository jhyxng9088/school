import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url))

test('main build path never injects the retired polite DOM runtime', () => {
  const main = read('src/main.jsx')
  const preview = read('src/preview-s-hub-v2-patch.js')
  const homeInfo = read('src/preview-home-info-patch.js')

  assert.doesNotMatch(main, /installPoliteCopyRuntime/)
  assert.doesNotMatch(preview, /installPoliteCopyRuntime/)
  assert.doesNotMatch(preview, /polite-copy-runtime\.js/)
  assert.doesNotMatch(homeInfo, /installPoliteCopyRuntime/)
  assert.doesNotMatch(homeInfo, /polite-copy-runtime\.js/)
  assert.match(homeInfo, /SOURCE_ROSTER_IMPORT/)
})

test('retired runtime cleanup and shared icon build owners stay out of the patch chain', () => {
  const main = read('src/main.jsx')
  const vite = read('vite.config.js')

  assert.equal(exists('src/final-runtime-owner-patch.js'), false)
  assert.equal(exists('src/shared-icon-owner-patch.js'), false)
  assert.match(main, /import \{ SHubIcon \} from '\.\/s-hub-icon\.jsx'/)
  assert.match(main, /return <SHubIcon name=\{type\} size=\{size\} \/>/)
  assert.equal((vite.match(/patchSharedSegmentSpringOwnerSource\(next, cleanId\)/g) || []).length, 1)
  assert.doesNotMatch(vite, /patchSharedIconOwnerSource/)
  assert.doesNotMatch(vite, /shared-icon-owner-patch\.js/)
  assert.doesNotMatch(vite, /patchFinalRuntimeOwnerSource/)
})

test('polite copy remains a build-time owner for static source and public JavaScript', () => {
  const vite = read('vite.config.js')
  assert.match(vite, /function replaceCopy\(source\)/)
  assert.match(vite, /function patchPublicBuildFiles\(directory\)/)
  assert.match(vite, /transform\(code, id\)/)
  assert.match(vite, /closeBundle\(\) \{\n      patchPublicBuildFiles/)
})
