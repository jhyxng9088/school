import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { patchPreviewStudySource } from '../src/preview-study-patch.js'
import { patchPreviewStudyUnifiedUISource } from '../src/preview-study-unified-ui-patch.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('study student record uses the shared UnifiedBottomSheet instead of a private sheet shell', () => {
  const studySource = patchPreviewStudySource(read('src/preview-study.jsx'), '/workspace/src/preview-study.jsx')
  const page = patchPreviewStudyUnifiedUISource(studySource, '/workspace/src/preview-study.jsx')

  assert.match(page, /import \{ UnifiedBottomSheet \} from '\.\/unified-sheet\.jsx'/)
  assert.match(page, /<UnifiedBottomSheet[\s\S]*className="preview-study-record-sheet"/)
  assert.match(page, /open=\{sheetOpen\}/)
  assert.match(page, /setSheetOpen\(false\)/)
  assert.match(page, /window\.setTimeout\(\(\) => \{[\s\S]*onClose\(\)[\s\S]*\}, 340\)/)
  assert.doesNotMatch(page, /className="preview-study-sheet-backdrop"/)
  assert.doesNotMatch(page, /className="preview-study-sheet"/)
})

test('ranking scope pill and bottom navigation share one final active-pill surface', () => {
  const styles = patchPreviewStudyUnifiedUISource(read('src/styles.css'), '/workspace/src/styles.css')
  const studyCss = patchPreviewStudyUnifiedUISource(read('src/preview-study.css'), '/workspace/src/preview-study.css')
  const rankingBase = patchPreviewStudySource(read('src/preview-study-ranking.css'), '/workspace/src/preview-study-ranking.css')
  const rankingCss = patchPreviewStudyUnifiedUISource(rankingBase, '/workspace/src/preview-study-ranking.css')

  assert.match(styles, /--s-hub-active-pill-surface:\s*#2f2f31/)
  assert.match(styles, /\.nav-indicator\s*\{[\s\S]*background:\s*var\(--s-hub-active-pill-surface\)\s*!important/)
  assert.match(styles, /\.nav-indicator::after\s*\{[\s\S]*background:\s*var\(--s-hub-active-pill-surface\)\s*!important/)
  assert.match(studyCss, /\.preview-study-ranking-pill,[\s\S]*background:\s*var\(--s-hub-active-pill-surface\)\s*!important/)
  assert.match(rankingCss, /\.preview-study-ranking-pill,[\s\S]*background:\s*var\(--s-hub-active-pill-surface\)\s*!important/)
  assert.match(styles, /html\.school-samsung[\s\S]*--s-hub-active-pill-surface:\s*var\(--surface\)/)
})

test('study record content spacing is scoped to the shared study sheet', () => {
  const css = patchPreviewStudyUnifiedUISource(read('src/preview-study-ranking.css'), '/workspace/src/preview-study-ranking.css')

  assert.match(css, /unified-school-sheet\.preview-study-record-sheet \.preview-study-sheet-total/)
  assert.match(css, /margin-top:\s*2px/)
  assert.match(css, /unified-school-sheet\.preview-study-record-sheet \.preview-study-sheet-subject-heading/)
})
