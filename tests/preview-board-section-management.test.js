import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { patchPreviewFastCacheSource } from '../src/preview-fast-cache-patch.js'
import { patchPreviewBoardSource } from '../src/preview-board-patch.js'
import { patchPreviewBoardAllSource } from '../src/preview-board-all-patch.js'
import { patchPreviewBoardSectionManagementSource } from '../src/preview-board-section-management-patch.js'
import { patchStudyVisualPolishSource } from '../src/study-visual-polish-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function buildBoardSource() {
  const raw = read('src/preview-board-complete.jsx')
  const cached = patchPreviewFastCacheSource(raw, '/src/preview-board-complete.jsx')
  const board = patchPreviewBoardSource(cached, '/src/preview-board-complete.jsx')
  const aggregate = patchPreviewBoardAllSource(board, '/src/preview-board-complete.jsx')
  return patchPreviewBoardSectionManagementSource(aggregate, '/src/preview-board-complete.jsx')
}

test('custom board sections reuse reminder long-press and context-menu management', () => {
  const source = buildBoardSource()

  assert.match(source, /pressTimerRef\.current = window\.setTimeout\(\(\) => \{/)
  assert.match(source, /\}, 520\)/)
  assert.match(source, /onPointerDown=\{\(event\) => beginPress\(section, event\)\}/)
  assert.match(source, /onPointerUp=\{finishPress\}/)
  assert.match(source, /onPointerCancel=\{finishPress\}/)
  assert.match(source, /onPointerLeave=\{finishPress\}/)
  assert.match(source, /onContextMenu=\{\(event\) => handleContextMenu\(event, section\)\}/)
  assert.match(source, /suppressClickRef\.current = true/)
  assert.match(source, /if \(suppressClickRef\.current\)/)
})

test('desktop context menu does not swallow the next normal section click', () => {
  const source = buildBoardSource()
  const handler = source.match(/function handleContextMenu\(event, section\) \{([\s\S]*?)\n  \}/)?.[1] || ''

  assert.match(handler, /event\.preventDefault\(\)/)
  assert.match(handler, /onManage\(section\.id\)/)
  assert.doesNotMatch(handler, /suppressClickRef\.current = true/)
})

test('only owned custom board sections expose the reminder-style action sheet', () => {
  const source = buildBoardSource()

  assert.match(source, /return Boolean\(section && !section\.builtin && section\.ownedByMe\)/)
  assert.match(source, /if \(!section \|\| section\.builtin \|\| !section\.ownedByMe\) return null/)
  assert.match(source, /className="preview-board-section-action-sheet"/)
  assert.match(source, />수정<\/button>/)
  assert.match(source, /className="is-danger" onClick=\{removeSection\}/)
  assert.match(source, /deletePreviewBoardSection\(section\.id\)/)
  assert.match(source, /섹션 관리<\/button>/)
})

test('board section edit sheet mirrors reminder save behavior and palette', () => {
  const source = buildBoardSource()

  assert.match(source, /title="섹션 수정"/)
  assert.match(source, /subtitle="변경 내용은 이 반의 게시판에 적용됩니다\."/)
  assert.match(source, /REMINDER_CATEGORY_COLORS\.map/)
  assert.match(source, /label\.normalize\('NFKC'\)\.trim\(\)\.replace\(\/\\s\+\/g, ' '\)/)
  assert.match(source, /editPreviewBoardSection\(section\.id, normalizedLabel, color\)/)
  assert.match(source, /onClose=\{\(\) => \{ if \(!pending\) onClose\(\) \}\}/)
  assert.match(source, /\{pending \? '저장 중…' : '저장'\}/)
  assert.match(source, /setSectionActionId\(''\)/)
  assert.match(source, /\}, 340\)/)
})

test('board section management styling matches the compact reminder action sheet', () => {
  const css = read('src/preview-board-section-management.css')

  assert.match(css, /preview-board-sections > button:not\(\.preview-board-section-add\)/)
  assert.match(css, /-webkit-touch-callout:\s*none/)
  assert.match(css, /preview-board-section-action-sheet/)
  assert.match(css, /max-width:\s*360px/)
  assert.match(css, /grid-template-columns:\s*1fr 1fr/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})

test('board section management transform accepts the current main React import', () => {
  const source = buildBoardSource()
  assert.match(source, /import \{ useCallback, useEffect, useMemo, useRef, useState \} from 'react'/)
})

test('board section editor keeps the downstream close-motion patch contract', () => {
  const source = buildBoardSource()
  const polished = patchStudyVisualPolishSource(source, '/src/preview-board-complete.jsx')

  assert.match(polished, /function BoardSectionEditor\(\{ section: incomingSection, sections, open, onClose, onUpdated, onDeleted \}\)/)
  assert.match(polished, /const retainedSectionRef = useRef\(incomingSection\)/)
})
