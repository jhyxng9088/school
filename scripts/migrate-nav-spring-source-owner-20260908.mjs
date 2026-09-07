import fs from 'node:fs'
import { patchPreviewNavSpringSource } from '../src/preview-nav-spring-patch.js'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function write(path, content) {
  fs.writeFileSync(path, content)
}

function removeRequired(source, marker, label) {
  const count = String(source).split(marker).length - 1
  if (count !== 1) throw new Error(`nav spring migration: expected 1 ${label}, found ${count}`)
  return source.replace(marker, '')
}

const mainPath = 'src/main.jsx'
const stylesPath = 'src/styles.css'
const vitePath = 'vite.config.js'
const effectPath = 'tests/build-patch-effect.test.js'

const rawMain = read(mainPath)
const rawStyles = read(stylesPath)
const ownedMain = patchPreviewNavSpringSource(rawMain, '/workspace/src/main.jsx')
const ownedStyles = patchPreviewNavSpringSource(rawStyles, '/workspace/src/styles.css')

if (ownedMain === rawMain) throw new Error('nav spring migration: main.jsx patch had no effect')
if (ownedStyles === rawStyles) throw new Error('nav spring migration: styles.css patch had no effect')

write(mainPath, ownedMain)
write(stylesPath, ownedStyles)

let vite = read(vitePath)
vite = removeRequired(vite, "import { patchPreviewNavSpringSource } from './src/preview-nav-spring-patch.js'\n", 'Vite import')
vite = removeRequired(vite, '  next = patchPreviewNavSpringSource(next, cleanId)\n', 'Vite transform call')
vite = removeRequired(vite, "        || cleanId.endsWith('/preview-nav-spring-patch.js')\n", 'polite-copy exclusion')
write(vitePath, vite)

let effect = read(effectPath)
effect = removeRequired(effect, "  ['patchPreviewNavSpringSource', 'preview-nav-spring-patch.js'],\n", 'build patch effect definition')
write(effectPath, effect)
