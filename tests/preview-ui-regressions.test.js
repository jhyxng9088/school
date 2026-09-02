import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { POLITE_COPY_REPLACEMENTS, POLITE_SOURCE_FRAGMENTS } from '../src/polite-copy-runtime.js'
import { PREVIEW_POLITE_COPY_REPLACEMENTS } from '../src/preview-polite-copy-additions.js'
import { patchPreviewSHubV2Source } from '../src/preview-s-hub-v2-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function replacePairs(source, pairs) {
  let next = String(source || '')
  for (const [from, to] of pairs) next = next.split(from).join(to)
  return next
}

test('tab changes reset the shared document scroll position before the new page settles', () => {
  const source = read('src/main.jsx')
  const patched = patchPreviewSHubV2Source(source, '/workspace/src/main.jsx')
  assert.match(patched, /useLayoutEffect\(\(\) => \{[\s\S]*?window\.scrollTo\(0, 0\)[\s\S]*?\}, \[activeTab\]\)/)
  assert.match(patched, /document\.scrollingElement/)
})

test('reported Safari and reminder-section copy is polite after the V2 build transform', () => {
  const main = patchPreviewSHubV2Source(read('src/main.jsx'), '/workspace/src/main.jsx')
  const todo = patchPreviewSHubV2Source(read('src/todo-stage5-ai.jsx'), '/workspace/src/todo-stage5-ai.jsx')
  const replacements = [
    ...POLITE_COPY_REPLACEMENTS,
    ...PREVIEW_POLITE_COPY_REPLACEMENTS,
    ...POLITE_SOURCE_FRAGMENTS,
  ]
  const builtMain = replacePairs(main, replacements)
  const builtTodo = replacePairs(todo, replacements)

  assert.match(builtMain, /Safari에서 홈 화면에 추가해 주세요/)
  assert.doesNotMatch(builtMain, /Safari에서 홈 화면에 추가해줘/)
  assert.match(builtMain, /S-Hub를 웹 앱으로 추가해 주세요/)
  assert.match(builtTodo, /리마인더를 구분할 이름과 색상을 골라 주세요/)
  assert.doesNotMatch(builtTodo, /이미 사용 중인 색이야/)
  assert.match(builtMain, /installPoliteCopyRuntime\(\)/)
})

test('the seven question examples remain deliberately informal', () => {
  const preserved = [
    '이번 주에 뭐 제출해야 돼?',
    '다음 시험 언제야?',
    '내일 시간표 뭐야?',
    '이번 주 시간표 바뀐 거 있어?',
    '예: 이건 수행평가 공지야.',
    '예: 마감일과 준비물만 찾아줘.',
    '예: 시간표 변경도 같이 확인해줘.',
  ]
  const sources = PREVIEW_POLITE_COPY_REPLACEMENTS.map(([from]) => from)
  preserved.forEach((text) => assert.equal(sources.includes(text), false))
})

test('production service worker cache is bumped and active installed clients refresh onto the new shell', () => {
  const sw = read('public/sw.js')
  assert.match(sw, /const CACHE_NAME = 'school-shell-v156-study-book'/)
  assert.doesNotMatch(sw, /school-preview-shell-/)
  assert.match(sw, /self\.clients\.matchAll\(\{ type: 'window', includeUncontrolled: true \}\)/)
  assert.match(sw, /await client\.navigate\(client\.url\)/)
})

test('production V2 config applies feature patches without preview identity rewrites', () => {
  const config = read('vite.config.js')
  assert.match(config, /school-s-hub-v2-features/)
  assert.match(config, /patchPreviewSHubV2Source/)
  assert.match(config, /patchPreviewAIReminderSummarySource/)
  assert.doesNotMatch(config, /previewLocalStorageText/)
  assert.doesNotMatch(config, /school-sync-preview/)
  assert.doesNotMatch(config, /preview-class-\$\{normalized\.classNumber\}/)
})
