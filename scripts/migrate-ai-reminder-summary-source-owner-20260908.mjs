import fs from 'node:fs'
import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, value) => fs.writeFileSync(path, value)

function replaceOne(source, marker, replacement, label) {
  const count = String(source).split(marker).length - 1
  if (count !== 1) throw new Error(`AI reminder summary migration: expected 1 ${label}, found ${count}`)
  return source.replace(marker, replacement)
}

function removeOne(source, marker, label) {
  return replaceOne(source, marker, '', label)
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

let home = read('tests/home-signal-navigation.test.js')
home = removeOne(home, "  const canonical = `${aiCore}${roster}${signals}${homeNav}${mealPriority}`\n", 'home canonical adjacency fixture')
home = replaceOne(
  home,
  '  assert.ok(main.includes(canonical))\n',
  "  assert.equal(main.split(aiCore).length - 1, 1)\n  assert.ok(main.indexOf(aiCore) < main.indexOf(roster))\n  assert.ok(main.indexOf(roster) < main.indexOf(signals))\n  assert.ok(main.indexOf(signals) < main.indexOf(homeNav))\n  assert.ok(main.indexOf(homeNav) < main.indexOf(mealPriority))\n",
  'home source-owner order assertion',
)
write('tests/home-signal-navigation.test.js', home)

let viewport = read('tests/preview-reminder-summary-viewport.test.js')
viewport = removeOne(viewport, "import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'\n", 'viewport patch import')
viewport = replaceOne(
  viewport,
  "test('preview reminder summary escapes transformed station ancestors without changing the shared source', () => {\n  const source = read('src/reminder-summary.jsx')\n  const transformed = patchPreviewAIReminderSummarySource(source, '/virtual/src/reminder-summary.jsx')\n\n  assert.doesNotMatch(source, /createPortal/)\n  assert.match(transformed, /import \\{ createPortal \\} from 'react-dom'/)\n  assert.match(transformed, /return createPortal\\([\\s\\S]*?className=\"reminder-summary-layer\"/)\n  assert.match(transformed, /<\\/div>,\\s*document\\.body,\\s*\\)\\s*\\}/)\n})",
  "test('reminder summary source owns the body portal after the build owner is retired', () => {\n  const source = read('src/reminder-summary.jsx')\n\n  assert.match(source, /import \\{ createPortal \\} from 'react-dom'/)\n  assert.match(source, /return createPortal\\([\\s\\S]*?className=\"reminder-summary-layer\"/)\n  assert.match(source, /<\\/div>,\\s*document\\.body,\\s*\\)\\s*\\}/)\n  assert.equal(fs.existsSync(new URL('../src/preview-ai-reminder-summary-patch.js', import.meta.url)), false)\n})",
  'viewport source-owner portal test',
)
viewport = replaceOne(
  viewport,
  "test('AI reminder import transform still applies after adding the summary portal path', () => {\n  const main = read('src/main.jsx')\n  const transformed = patchPreviewAIReminderSummarySource(main, '/virtual/src/main.jsx')\n\n  assert.match(transformed, /enrichImportedAIReminder/)\n  assert.match(transformed, /createPendingReminderSummary/)\n  assert.match(transformed, /claimSchoolAIReminderSource/)\n})",
  "test('AI reminder import source remains owned after adding the summary portal path', () => {\n  const main = read('src/main.jsx')\n\n  assert.match(main, /enrichImportedAIReminder/)\n  assert.match(main, /createPendingReminderSummary/)\n  assert.match(main, /claimSchoolAIReminderSource/)\n})",
  'viewport AI source-owner test',
)
write('tests/preview-reminder-summary-viewport.test.js', viewport)

let ui = read('tests/preview-ui-regressions.test.js')
ui = replaceOne(
  ui,
  '  assert.match(config, /patchPreviewAIReminderSummarySource/)\n',
  '  assert.doesNotMatch(config, /patchPreviewAIReminderSummarySource/)\n',
  'UI retired AI summary patch assertion',
)
write('tests/preview-ui-regressions.test.js', ui)

let original = read('tests/reminder-original-download.test.js')
original = removeOne(original, "import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'\n", 'original viewer patch import')
original = replaceOne(
  original,
  "  const summary = patchPreviewAIReminderSummarySource(\n    read('src/reminder-summary.jsx'),\n    '/workspace/src/reminder-summary.jsx',\n  )\n",
  "  const summary = read('src/reminder-summary.jsx')\n",
  'original viewer transformed summary fixture',
)
write('tests/reminder-original-download.test.js', original)

let presave = read('tests/s-hub-ai-presave-summary.test.js')
presave = replaceOne(
  presave,
  "  const summaryPatch = readFileSync(new URL('../src/preview-ai-reminder-summary-patch.js', import.meta.url), 'utf8')\n",
  "  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')\n",
  'presave summary patch fixture',
)
presave = presave.replaceAll('assert.match(summaryPatch,', 'assert.match(main,')
write('tests/s-hub-ai-presave-summary.test.js', presave)

let summaryImport = read('tests/s-hub-ai-reminder-summary-import.test.js')
summaryImport = removeOne(summaryImport, "import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'\n", 'AI import summary patch import')
summaryImport = removeOne(summaryImport, "import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'\n", 'AI import V2 patch import')
summaryImport = replaceOne(
  summaryImport,
  "function builtPreviewMain() {\n  const raw = fs.readFileSync(mainPath, 'utf8')\n  const withUiPatch = patchPreviewSHubV2Source(raw, mainPath)\n  return patchPreviewAIReminderSummarySource(withUiPatch, mainPath)\n}\n",
  "function sourceOwnedMain() {\n  return fs.readFileSync(mainPath, 'utf8')\n}\n",
  'AI import built preview fixture',
)
summaryImport = summaryImport.replaceAll('builtPreviewMain()', 'sourceOwnedMain()')
summaryImport = replaceOne(
  summaryImport,
  "test('preview Vite 빌드는 UI 패치 뒤 AI 요약 패치를 적용한다', () => {\n  const vite = fs.readFileSync(vitePath, 'utf8')\n  const uiIndex = vite.indexOf('patchPreviewSHubV2Source(next, cleanId)')\n  const summaryIndex = vite.indexOf('patchPreviewAIReminderSummarySource(next, cleanId)')\n  assert.ok(uiIndex >= 0)\n  assert.ok(summaryIndex > uiIndex)\n})",
  "test('AI 요약은 raw source가 소유하고 Vite는 퇴역 patch를 다시 적용하지 않는다', () => {\n  const vite = fs.readFileSync(vitePath, 'utf8')\n  const source = sourceOwnedMain()\n  assert.match(vite, /patchPreviewSHubV2Source/)\n  assert.doesNotMatch(vite, /patchPreviewAIReminderSummarySource/)\n  assert.match(source, /enrichImportedAIReminder/)\n  assert.equal(fs.existsSync(path.join(root, 'src', 'preview-ai-reminder-summary-patch.js')), false)\n})",
  'AI import retired Vite patch test',
)
write('tests/s-hub-ai-reminder-summary-import.test.js', summaryImport)
