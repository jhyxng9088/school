import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('V2 unread parents aggregate their visible child sections', () => {
  const source = read('src/unread-indicators-v2.js')
  assert.match(source, /if \(tab === 'class'\) return navUnread\('timetable'\) \|\| navUnread\('board'\)/)
  assert.match(source, /if \(tab === 'schedule'\) return navUnread\('todo'\) \|\| navUnread\('academic'\) \|\| navUnread\('meal'\)/)
  assert.match(source, /if \(tab === 'study'\) return state\.studyUnread/)
  assert.match(source, /renderTopSegments\(\)/)
})

test('opening a parent station does not erase unread siblings', () => {
  const source = read('src/unread-indicators-v2.js')
  assert.match(source, /if \(tab && !\['class', 'schedule'\]\.includes\(tab\)\) markTabSeen\(tab\)/)
  assert.ok(source.includes(".class-station-page .class-top-segment-button.is-active[data-unread-key]"))
  assert.ok(source.includes(".station-schedule-page .class-top-segment-button.is-active[data-unread-key]"))
})

test('board section visit and unopened post state are separate cursors', () => {
  const source = read('src/preview-board-unread.js')
  assert.match(source, /seenCursor/)
  assert.match(source, /hasSectionUnread/)
  assert.match(source, /export function markPreviewBoardSectionSeen/)
  const sectionSeen = source.slice(source.indexOf('function markSectionSeenFor'), source.indexOf('export function subscribePreviewBoardUnread'))
  assert.doesNotMatch(sectionSeen, /delete next\[/)
})

test('study unread reacts to new starts only and realtime supports parallel consumers', () => {
  const unread = read('src/preview-study-unread.js')
  const realtime = read('src/preview-study-realtime.js')
  assert.match(unread, /String\(payload\?\.kind \|\| ''\) === 'start'/)
  assert.match(realtime, /const localStates = \[/)
  assert.doesNotMatch(realtime, /let subscriptionStates = \[\]/)
  assert.doesNotMatch(realtime, /subscriptionStates\.forEach\(stopSocketState\)/)
})

test('segment unread keys are rendered semantically without a text-inference observer', () => {
  const html = read('index.html')
  const css = read('src/unread-indicators.css')
  const classSegment = read('src/preview-class-top-segment-patch.js')
  assert.doesNotMatch(html, /preview-unread-dom-keys\.js/)
  assert.match(html, /unread-indicators-v2\.js/)
  assert.match(classSegment, /data-unread-key=\{item\.id\}/)
  assert.doesNotMatch(classSegment, /SEGMENT_BUTTON_KEY_MARKER/)
  assert.match(css, /school-unread-dot\.is-segment/)
})

test('unread redraw follows semantic interactions without a DOM observer', () => {
  const source = read('src/unread-indicators-v2.js')
  const clickHandler = source.slice(source.indexOf('function handleClick(event)'), source.indexOf('subscriptions.push'))
  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /domObserver/)
  assert.match(source, /document\.addEventListener\('click', handleClick, true\)/)
  assert.match(clickHandler, /class-top-segment-button\[data-unread-key\][\s\S]*scheduleRender\(\)/)
  assert.match(clickHandler, /bottom-nav \.nav-button[\s\S]*scheduleRender\(\)/)
  assert.match(clickHandler, /todo-item-main[\s\S]*scheduleRender\(\)/)
  assert.equal((clickHandler.match(/scheduleRender\(\)/g) || []).length, 3)
})
