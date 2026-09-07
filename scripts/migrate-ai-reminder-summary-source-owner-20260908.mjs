import fs from 'node:fs'
import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, value) => fs.writeFileSync(path, value)

function removeOne(source, marker, label) {
  const count = String(source).split(marker).length - 1
  if (count !== 1) throw new Error(`AI reminder summary migration: expected 1 ${label}, found ${count}`)
  return source.replace(marker, '')
}

for (const path of ['src/main.jsx', 'src/reminder-summary.jsx']) {
  const before = read(path)
  const after = patchPreviewAIReminderSummarySource(before, `/workspace/${path}`)
  if (after === before) throw new Error(`AI reminder summary migration: ${path} patch had no effect`)
  write(path, after)
}

let vite = read('vite.config.js')
vite = removeOne(vite, "import { patchPreviewAIReminderSummarySource } from './src/preview-ai-reminder-summary-patch.js'\n", 'Vite import')
vite = removeOne(vite, '  next = patchPreviewAIReminderSummarySource(next, cleanId)\n', 'Vite transform call')
vite = removeOne(vite, "        || cleanId.endsWith('/preview-ai-reminder-summary-patch.js')\n", 'polite-copy exclusion')
write('vite.config.js', vite)

let effect = read('tests/build-patch-effect.test.js')
effect = removeOne(effect, "  ['patchPreviewAIReminderSummarySource', 'preview-ai-reminder-summary-patch.js'],\n", 'build patch effect definition')
write('tests/build-patch-effect.test.js', effect)
