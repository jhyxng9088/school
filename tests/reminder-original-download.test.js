import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('original files share only on Apple touch devices and download directly elsewhere', () => {
  const summary = read('src/reminder-summary.jsx')

  assert.match(summary, /function isAppleTouchDevice\(\)/)
  assert.match(summary, /iPhone\|iPad\|iPod/)
  assert.match(summary, /Macintosh[\s\S]*navigator\.maxTouchPoints > 1/)
  assert.match(summary, /if \(isAppleTouchDevice\(\)\) \{[\s\S]*navigator\.share/)
  assert.match(summary, /function downloadOriginal\(original\)/)
  assert.match(summary, /anchor\.download = original\.name \|\| '원본-파일'/)
  assert.match(summary, /downloadOriginal\(original\)/)
})

test('original save uses an immediate ref lock so one gesture cannot open duplicate dialogs', () => {
  const summary = read('src/reminder-summary.jsx')

  assert.match(summary, /const DOWNLOAD_GESTURE_LOCK_MS = 700/)
  assert.match(summary, /const savingRef = useRef\(false\)/)
  assert.match(summary, /if \(!original\?\.blob \|\| savingRef\.current\) return\s+savingRef\.current = true/)
  assert.match(summary, /if \(downloadedDirectly\) \{[\s\S]*window\.setTimeout\([\s\S]*DOWNLOAD_GESTURE_LOCK_MS/)
  assert.match(summary, /downloadLockTimerRef\.current[\s\S]*window\.clearTimeout/)
  assert.match(summary, /draggable="false"/)
})
