import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('unified sheets expose collapsed and expanded states without changing their callers', () => {
  const sheet = read('src/unified-sheet.jsx')
  const css = read('src/unified-sheet.css')

  assert.match(sheet, /const \[expanded, setExpanded\] = useState\(false\)/)
  assert.match(sheet, /expanded \? 'is-expanded' : 'is-collapsed'/)
  assert.match(css, /height:\s*var\(--unified-sheet-height\)\s*!important;/)
  assert.match(css, /height 420ms cubic-bezier/)
  assert.match(css, /\.is-collapsed\s*\{[\s\S]*?max-height:\s*min\(68dvh, 560px\)/)
  assert.match(css, /\.is-expanded\s*\{[\s\S]*?max-height:\s*min\(88dvh, 760px\)/)
  assert.match(css, /\.is-collapsed \.unified-sheet-scroll\s*\{[\s\S]*?overflow-y:\s*hidden;/)
  assert.match(css, /\.is-expanded \.unified-sheet-scroll\s*\{[\s\S]*?overflow-y:\s*auto;/)
})

test('desktop wheel gestures expand, collapse at scroll top, and close in separate gesture sessions', () => {
  const sheet = read('src/unified-sheet.jsx')

  assert.match(sheet, /sheet\.addEventListener\('wheel', onWheel, \{ passive: false \}\)/)
  assert.match(sheet, /delta >= 0 \|\| scroll\.scrollTop > 1/)
  assert.match(sheet, /wheel\.distance >= WHEEL_EXPAND_DISTANCE[\s\S]*?settleSheetExtent\(true\)/)
  assert.match(sheet, /wheel\.distance >= WHEEL_COLLAPSE_DISTANCE[\s\S]*?settleSheetExtent\(false\)/)
  assert.match(sheet, /wheel\.distance >= WHEEL_CLOSE_DISTANCE[\s\S]*?requestClose\(\)/)
  assert.match(sheet, /wheel\.locked = true/)
  assert.match(sheet, /WHEEL_IDLE_MS/)
})

test('mobile blank-area swipes yield to expanded content scrolling and reclaim downward pulls at the top', () => {
  const sheet = read('src/unified-sheet.jsx')

  assert.match(sheet, /sheet\.addEventListener\('touchmove', onTouchMove, \{ passive: false \}\)/)
  assert.match(sheet, /!expandedRef\.current && event\.target\.closest\(INTERACTIVE_SELECTOR\)/)
  assert.match(sheet, /deltaY < 0 \|\| \(!touch\.startedInHead && scroll\.scrollTop > 1\)/)
  assert.match(sheet, /touch\.mode = 'collapse'/)
  assert.match(sheet, /touch\.mode = deltaY < 0 \? 'expand' : 'dismiss'/)
  assert.match(sheet, /settleSheetExtent\(true\)/)
  assert.match(sheet, /settleSheetExtent\(false\)/)
})
