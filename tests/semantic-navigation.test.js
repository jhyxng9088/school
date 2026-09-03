import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

function loadNavigation() {
  const window = {}
  vm.runInNewContext(read('public/s-hub-navigation.js'), { window, Set, Object, String })
  return window.SHubNavigation
}

test('semantic navigation normalizes legacy leaf routes to V2 stations', () => {
  const navigation = loadNavigation()

  assert.deepEqual({ ...navigation.normalizeRoute('home') }, { tab: 'home' })
  assert.deepEqual({ ...navigation.normalizeRoute('timetable') }, { tab: 'class', section: 'timetable' })
  assert.deepEqual({ ...navigation.normalizeRoute('board') }, { tab: 'class', section: 'board' })
  assert.deepEqual({ ...navigation.normalizeRoute('todo') }, { tab: 'schedule', section: 'todo' })
  assert.deepEqual({ ...navigation.normalizeRoute('academic') }, { tab: 'schedule', section: 'academic' })
  assert.deepEqual({ ...navigation.normalizeRoute('meal') }, { tab: 'schedule', section: 'meal' })
  assert.equal(navigation.normalizeRoute('missing'), null)
})

test('semantic navigation accepts explicit station routes but rejects invalid sections', () => {
  const navigation = loadNavigation()

  assert.deepEqual(
    { ...navigation.normalizeRoute({ tab: 'class', section: 'board' }) },
    { tab: 'class', section: 'board' },
  )
  assert.deepEqual(
    { ...navigation.normalizeRoute({ tab: 'schedule', section: 'meal' }) },
    { tab: 'schedule', section: 'meal' },
  )
  assert.deepEqual(
    { ...navigation.normalizeRoute({ tab: 'class', section: 'meal' }) },
    { tab: 'class', section: 'timetable' },
  )
})

test('semantic navigation preserves the latest request until an owner can receive it', () => {
  const navigation = loadNavigation()
  const received = []

  assert.equal(navigation.navigate('board'), true)
  assert.equal(navigation.navigate('study'), true)
  const unregister = navigation.register((route) => received.push({ ...route }))

  assert.deepEqual(received, [{ tab: 'study' }])

  navigation.navigate({ tab: 'schedule', section: 'academic' })
  assert.deepEqual(received.at(-1), { tab: 'schedule', section: 'academic' })

  unregister()
  navigation.navigate('meal')
  assert.equal(received.length, 2)
})

test('home and notification routing share one semantic navigation bridge', () => {
  const index = read('index.html')
  const home = read('public/school-home-nav.js')
  const notifications = read('public/notification-routing.js')
  const bridge = read('public/s-hub-navigation.js')

  const bridgeIndex = index.indexOf('./s-hub-navigation.js')
  assert.ok(bridgeIndex >= 0)
  assert.ok(bridgeIndex < index.indexOf('./school-home-nav.js'))
  assert.ok(bridgeIndex < index.indexOf('./notification-routing.js'))

  assert.match(home, /SHubNavigation\?\.navigate\(route\)/)
  assert.doesNotMatch(home, /\.bottom-nav \.nav-button/)
  assert.doesNotMatch(home, /afterReactCommit/)

  assert.match(notifications, /SHubNavigation\?\.navigate\(tab\)/)
  assert.doesNotMatch(notifications, /new MutationObserver/)
  assert.doesNotMatch(notifications, /\.click\(\)/)

  assert.match(bridge, /pendingRoute = route/)
  assert.match(bridge, /handler\(route\)/)
  assert.doesNotMatch(bridge, /tryLegacyDomRoute/)
  assert.doesNotMatch(bridge, /new MutationObserver/)
  assert.doesNotMatch(bridge, /\.click\(\)/)
  assert.doesNotMatch(bridge, /querySelector/)
})
