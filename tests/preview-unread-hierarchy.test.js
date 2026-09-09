import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('unread store is the single nav unread data owner', () => {
  const indicator = read('src/unread-indicators-v2.js')
  const store = read('src/unread-store.js')

  assert.match(indicator, /from '\.\/unread-store\.js'/)
  assert.match(indicator, /subscribeUnreadState\(profile/)
  assert.doesNotMatch(indicator, /firebase\/|subscribeClassLiveData|preview-board-unread|preview-study-unread/)

  assert.match(store, /subscribeClassLiveData\('activity', store\.classId/)
  assert.match(store, /subscribeClassLiveData\('todoState', store\.studentKey/)
  assert.match(store, /subscribePreviewBoardUnread\(store\.profile/)
  assert.match(store, /subscribePreviewStudyUnread\(store\.profile/)
})

test('V2 unread parents aggregate their visible child sections in the store', () => {
  const store = read('src/unread-store.js')
  const indicator = read('src/unread-indicators-v2.js')

  assert.match(store, /if \(tab === 'class'\) return leafUnread\(store, 'timetable'\) \|\| leafUnread\(store, 'board'\)/)
  assert.match(store, /if \(tab === 'schedule'\) return leafUnread\(store, 'todo'\) \|\| leafUnread\(store, 'academic'\) \|\| leafUnread\(store, 'meal'\)/)
  assert.match(store, /if \(tab === 'study'\) return store\.state\.studyUnread/)
  assert.doesNotMatch(store, /NAV_STATE_IDS\.(class|schedule)/)
  assert.match(indicator, /renderTopSegments\(\)/)
})

test('opening a parent station acknowledges only the active leaf after React commits', () => {
  const indicator = read('src/unread-indicators-v2.js')

  assert.ok(indicator.includes(".class-station-page .class-top-segment-button.is-active[data-unread-key]"))
  assert.ok(indicator.includes(".station-schedule-page .class-top-segment-button.is-active[data-unread-key]"))
  assert.match(indicator, /const tab = activeLeafTab\(\)/)
  assert.match(indicator, /const capturedTarget = cloneSeenTarget\(current\.targets\?\.\[tab\]\)/)
  assert.match(indicator, /markUnreadSeen\(profile, tab, capturedTarget\)/)
  assert.doesNotMatch(indicator, /markUnreadSeen\(profile, 'class'/)
  assert.doesNotMatch(indicator, /markUnreadSeen\(profile, 'schedule'/)
})

test('active reminder hierarchy keeps parent and segment dots while unread summary rows remain', () => {
  const indicator = read('src/unread-indicators-v2.js')
  const parentUnread = indicator.slice(indicator.indexOf('function parentHasUnreadOutsideActiveLeaf'), indicator.indexOf('function scheduleVisibleSeen'))
  const topSegments = indicator.slice(indicator.indexOf('function renderTopSegments()'), indicator.indexOf('function renderNav()'))

  assert.match(indicator, /function hasUnreadReminderRows\(\)/)
  assert.match(indicator, /current\.reminderUnreadIds\.length > 0/)
  assert.match(parentUnread, /leaf === 'todo' && hasUnreadReminderRows\(\)/)
  assert.match(topSegments, /const keepNestedReminderUnread = tab === 'todo' && tab === activeLeaf && hasUnreadReminderRows\(\)/)
  assert.match(topSegments, /if \(tab === activeLeaf && !keepNestedReminderUnread\)/)
  assert.match(topSegments, /if \(current\.unread\?\.\[tab\]\) addDot\(button, 'segment'\)/)
})

test('active top tab uses semantic navigation state before the visual active class', () => {
  const indicator = read('src/unread-indicators-v2.js')
  const activeTop = indicator.slice(indicator.indexOf('function activeTopTab()'), indicator.indexOf('function activeLeafTab()'))

  assert.match(activeTop, /nav-button\[aria-current="page"\]/)
  assert.match(activeTop, /semanticActive \|\| document\.querySelector\('\.bottom-nav \.nav-button\.active'\)/)
  assert.ok(activeTop.indexOf('aria-current="page"') < activeTop.indexOf('.nav-button.active'))
})

test('board section visit and unopened post state are separate monotonic cursors', () => {
  const source = read('src/preview-board-unread.js')
  assert.match(source, /seenCursor/)
  assert.match(source, /hasSectionUnread/)
  assert.match(source, /export function markPreviewBoardSectionSeen/)
  const sectionSeen = source.slice(source.indexOf('function markSectionSeenFor'), source.indexOf('export function subscribePreviewBoardUnread'))
  assert.match(sectionSeen, /const cursor = Math\.min\(currentCursor, requested\)/)
  assert.doesNotMatch(sectionSeen, /delete next\[/)
})

test('study unread reacts to new starts only and supports a bounded rendered cursor', () => {
  const unread = read('src/preview-study-unread.js')
  const realtime = read('src/preview-study-realtime.js')

  assert.match(unread, /String\(payload\?\.kind \|\| ''\) === 'start'/)
  assert.match(unread, /function boundedSeenTarget\(controller, target\)/)
  assert.match(unread, /seenCursor: Math\.min\(currentCursor/)
  assert.match(unread, /controller\.state\.hasUnread = Number\(controller\.state\.eventCursor \|\| 0\) > Number\(controller\.state\.seenCursor \|\| 0\)/)
  assert.match(realtime, /const localStates = \[/)
  assert.doesNotMatch(realtime, /let subscriptionStates = \[\]/)
  assert.doesNotMatch(realtime, /subscriptionStates\.forEach\(stopSocketState\)/)
})

test('segment unread keys are rendered semantically without text inference or a DOM observer', () => {
  const html = read('index.html')
  const css = read('src/unread-indicators.css')
  const indicator = read('src/unread-indicators-v2.js')
  const classOwner = read('src/preview-class-top-segment-patch.js')
  const scheduleOwner = read('src/preview-schedule-top-segment-patch.js')

  assert.doesNotMatch(html, /preview-unread-dom-keys\.js/)
  assert.match(html, /unread-indicators-v2\.js/)
  assert.match(indicator, /button\?\.dataset\?\.tab/)
  assert.doesNotMatch(indicator, /textContent|innerText|MutationObserver/)
  assert.match(classOwner, /data-unread-key=\{item\.id\}/)
  assert.match(scheduleOwner, /data-unread-key=\{item\.id\}/)
  assert.match(classOwner, /return useSHubSegmentSpring\(activeIndex, \{/)
  assert.match(css, /school-unread-dot\.is-segment/)
})

test('visible unread is acknowledged after rendering, not during unread calculation', () => {
  const indicator = read('src/unread-indicators-v2.js')
  const store = read('src/unread-store.js')
  const visibleSeen = indicator.slice(indicator.indexOf('function scheduleVisibleSeen()'), indicator.indexOf('function renderReminderRows()'))
  const renderBody = indicator.slice(indicator.indexOf('function render()'), indicator.indexOf('function scheduleRender()'))

  assert.equal((visibleSeen.match(/window\.requestAnimationFrame/g) || []).length, 2)
  assert.ok(visibleSeen.indexOf('capturedTarget') < visibleSeen.indexOf('markUnreadSeen(profile, tab, capturedTarget)'))
  assert.doesNotMatch(renderBody, /markUnreadSeen/)
  assert.match(store, /function clampNumberTarget\(target, current\)/)
  assert.match(store, /return Math\.min\(currentVersion, requested\)/)
})

test('generic read state is cached, retryable, and never regresses behind local acknowledgement', () => {
  const store = read('src/unread-store.js')
  const todoStateSubscription = store.slice(
    store.indexOf("subscribeClassLiveData('todoState'"),
    store.indexOf('async function connectStore'),
  )

  assert.match(store, /READ_CACHE_PREFIX = 'school\.unreadState\.v3:'/)
  assert.match(store, /pendingWrites/)
  assert.match(store, /async function flushPendingWrites\(store\)/)
  assert.match(store, /window\.addEventListener\('online', store\.onResume\)/)
  assert.match(todoStateSubscription, /store\.state\.seen\.forEach\(\(value, id\) =>/)
  assert.match(todoStateSubscription, /localVersion > Number\(nextSeen\.get\(id\)\?\.updatedAt \|\| 0\)/)
  assert.ok(todoStateSubscription.indexOf('store.state.seen.forEach') < todoStateSubscription.indexOf('store.pendingWrites.forEach'))
})
