import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('navigation settling repaints newly mounted child unread indicators', () => {
  const indicator = read('src/unread-indicators-v2.js')
  const settle = indicator.slice(
    indicator.indexOf('function scheduleNavigationSettle()'),
    indicator.indexOf('function handleClick(event)'),
  )

  assert.match(indicator, /function renderMountedUnreadUi\(\)/)
  assert.match(indicator, /renderTopSegments\(\)/)
  assert.match(settle, /navigationSettlePasses = Math\.max\(navigationSettlePasses, 6\)/)
  assert.match(settle, /renderMountedUnreadUi\(\)/)
  assert.match(settle, /navigationSettleFrame = window\.requestAnimationFrame\(settle\)/)
  assert.match(settle, /scheduleVisibleSeen\(\)/)
})

test('bottom navigation waits for the destination before acknowledging Study unread', () => {
  const indicator = read('src/unread-indicators-v2.js')
  const click = indicator.slice(
    indicator.indexOf('function handleClick(event)'),
    indicator.indexOf('const unsubscribe = subscribeUnreadState'),
  )

  assert.match(click, /\.bottom-nav \.nav-button/)
  assert.match(click, /\.class-top-segment-button\[data-unread-key\]/)
  assert.match(click, /\.home-nav-action/)
  assert.match(click, /if \(navigationControl\) \{[\s\S]*scheduleNavigationSettle\(\)[\s\S]*return/)
  assert.ok(click.indexOf('scheduleNavigationSettle()') < click.indexOf('scheduleVisibleSeen()'))
})

test('shared base timetable and dated timetable changes both feed timetable unread', () => {
  const main = read('src/main.jsx')
  const store = read('src/unread-store.js')
  const classSegment = read('src/preview-class-top-segment-patch.js')

  assert.match(main, /entityType: 'timetable', entityId: 'weekly'/)
  assert.match(main, /entityId: 'base-' \+ dayId \+ '-' \+ period/)
  assert.match(main, /entityId: `\$\{changeDate\}-\$\{changePeriod\}`/)
  assert.match(store, /otherActivityVersion\(store, 'timetable'\) > seenVersion\(store, NAV_STATE_IDS\.timetable\)/)
  assert.match(classSegment, /\{ id: 'timetable', label: '시간표' \}/)
  assert.match(classSegment, /data-unread-key=\{item\.id\}/)
})
