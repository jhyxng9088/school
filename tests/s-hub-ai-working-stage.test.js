import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('S-Hub AI replaces the compose UI with a compact live working stage', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')

  assert.match(sheet, /!working && \(state\.mode === 'compose' \|\| state\.mode === 'answer'\)/)
  assert.match(sheet, /!working && state\.mode === 'answer'/)
  assert.match(sheet, /<SHubAIOrb size=\{56\} active/)
  assert.match(sheet, /aria-live=\"polite\"/)
  assert.match(css, /\.s-hub-ai-thinking-stage\s*\{[\s\S]*?min-height:\s*142px;/)
})

test('working copy reflects attachment type and real conflict-review stage', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')

  assert.match(sheet, /사진을 분석하는 중…/)
  assert.match(sheet, /파일을 분석하는 중…/)
  assert.match(sheet, /사진과 파일을 분석하는 중…/)
  assert.match(sheet, /학교 일정을 찾는 중…/)
  assert.match(sheet, /날짜와 내용을 확인하는 중…/)
  assert.match(sheet, /showWorkingMode\('conflict'\)[\s\S]*?reviewSchoolImportConflicts/)
  assert.match(sheet, /기존 일정과 겹치는지 확인하는 중…/)
})

test('working copy changes softly at a non-rigid cadence and remains cancellable', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')

  assert.match(sheet, /1550 \+ Math\.round\(Math\.random\(\) \* 850\)/)
  assert.match(sheet, /setWorkingMessageFading\(true\)/)
  assert.match(sheet, /requestControllerRef\.current\?\.abort\(\)/)
  assert.match(css, /transition: opacity 240ms[\s\S]*?transform 240ms/)
})

test('working stage contracts before completed AI results reveal smoothly', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  const css = read('src/s-hub-ai.css')

  assert.match(sheet, /workingFinishing/)
  assert.match(sheet, /finishWorkingStage\(requestId\)/)
  assert.match(sheet, /window\.setTimeout\(resolve, 420\)/)
  assert.match(sheet, /s-hub-ai-thinking-stage \$\{workingFinishing \? 'is-finishing' : ''\}/)
  assert.match(css, /\.s-hub-ai-thinking-stage\.is-finishing \.s-hub-ai-orb[\s\S]*?scale\(0\.32\)/)
  assert.match(sheet, /!working && state\.mode === 'import'/)
  assert.match(sheet, /!working && state\.mode === 'result'/)
  assert.match(css, /@keyframes s-hub-ai-result-reveal/)
  assert.match(css, /\.s-hub-ai-answer,[\s\S]*?\.s-hub-ai-import,[\s\S]*?animation: s-hub-ai-result-reveal 560ms/)
})
