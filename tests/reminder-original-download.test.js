import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { patchPreviewAIReminderSummarySource } from '../src/preview-ai-reminder-summary-patch.js'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('original files share only on Apple touch devices and download directly elsewhere', () => {
  const shared = read('src/original-file-viewer.jsx')

  assert.match(shared, /function isAppleTouchDevice\(\)/)
  assert.match(shared, /iPhone\|iPad\|iPod/)
  assert.match(shared, /Macintosh[\s\S]*navigator\.maxTouchPoints > 1/)
  assert.match(shared, /if \(isAppleTouchDevice\(\)\) \{[\s\S]*navigator\.share/)
  assert.match(shared, /function downloadOriginal\(original\)/)
  assert.match(shared, /anchor\.download = original\.name \|\| '원본-파일'/)
  assert.match(shared, /downloadOriginal\(original\)/)
})

test('original save uses one shared immediate ref lock and reminder runtime removes its duplicate viewer', () => {
  const shared = read('src/original-file-viewer.jsx')
  const summary = patchPreviewAIReminderSummarySource(
    read('src/reminder-summary.jsx'),
    '/workspace/src/reminder-summary.jsx',
  )

  assert.match(shared, /const DOWNLOAD_GESTURE_LOCK_MS = 700/)
  assert.match(shared, /const savingRef = useRef\(false\)/)
  assert.match(shared, /if \(!original\?\.blob \|\| savingRef\.current\) return\s+savingRef\.current = true/)
  assert.match(shared, /if \(downloadedDirectly\) \{[\s\S]*window\.setTimeout\([\s\S]*DOWNLOAD_GESTURE_LOCK_MS/)
  assert.match(shared, /downloadLockTimerRef\.current[\s\S]*window\.clearTimeout/)
  assert.match(shared, /draggable="false"/)
  assert.match(summary, /import \{ OriginalFileViewer \} from '\.\/original-file-viewer\.jsx'/)
  assert.match(summary, /<OriginalFileViewer[\s\S]*?formatSize=\{fileSizeLabel\}/)
  assert.doesNotMatch(summary, /function OriginalImageViewer/)
  assert.doesNotMatch(summary, /function isAppleTouchDevice/)
})
