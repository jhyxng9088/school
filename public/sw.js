const CACHE_NAME = 'school-shell-v160-class-board-stability'
const NOTIFICATION_PROFILE_CACHE = 'school-notification-profile-v1'
const NOTIFICATION_PROFILE_URL = new URL('./__notification-tone-profile__', self.registration.scope).href
const PERSONALIZED_STUDENT_KEY = 'student-a63dc064d4c5227e'
const APP_SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-android.svg', './school-refinements.css', './stage3-polish.css', './school-page-motion.css', './reminder-list-motion.css', './school-home-live.css', './first-run-notice.css', './feature-tour-sequences.css', './v2-update-notice.css', './v2-update-device-fixes.css', './samsung-nav-icon-fixes.css', './school-timetable-motion.js', './school-home-nav.js', './school-home-live.js', './feature-tour-ai-orb.js', './v2-update-audience.js', './first-run-notice.js', './v2-update-notice.js', './notification-routing.js', './notification-tone-profile.js']
const ROUTINE_PUSH_PAUSE_FROM_MS = Date.parse('2026-09-01T00:00:00+09:00')

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => ![CACHE_NAME, NOTIFICATION_PROFILE_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

async function saveNotificationToneProfile(studentKey) {
  const cache = await caches.open(NOTIFICATION_PROFILE_CACHE)
  await cache.put(
    new Request(NOTIFICATION_PROFILE_URL),
    new Response(String(studentKey || ''), { headers: { 'content-type': 'text/plain' } }),
  )
}

async function readNotificationToneProfile() {
  try {
    const cache = await caches.open(NOTIFICATION_PROFILE_CACHE)
    const response = await cache.match(new Request(NOTIFICATION_PROFILE_URL))
    return response ? String(await response.text()).trim() : ''
  } catch {
    return ''
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (event.data?.type === 'SET_NOTIFICATION_TONE_PROFILE') {
    event.waitUntil(saveNotificationToneProfile(String(event.data?.studentKey || '')))
  }
})

function notificationTarget(tag, body, fallbackUrl = './') {
  const normalizedTag = String(tag || '').toLowerCase()
  const normalizedBody = String(body || '')

  if (normalizedTag.includes('board') || normalizedBody.includes('게시판')) return { url: './?tab=board', tab: 'board' }
  if (normalizedTag.includes('study') || normalizedBody.includes('스터디') || normalizedBody.includes('공부를 시작')) return { url: './?tab=study', tab: 'study' }
  if (normalizedTag.includes('reminder') || normalizedBody.includes('리마인더')) return { url: './?tab=todo', tab: 'todo' }
  if (normalizedTag.includes('timetable') || normalizedBody.includes('시간표')) return { url: './?tab=timetable', tab: 'timetable' }
  if (normalizedTag.includes('academic') || normalizedBody.includes('학사일정')) return { url: './?tab=academic', tab: 'academic' }
  if (normalizedTag.includes('meal') || normalizedBody.includes('급식') || normalizedBody.includes('점심시간')) return { url: './?tab=meal', tab: 'meal' }
  if (normalizedTag.includes('next-class') || normalizedTag.includes('period-') || normalizedBody.includes('다음 시간은')) return { url: './?tab=home', tab: 'home' }
  return { url: fallbackUrl, tab: '' }
}

function routinePushPaused(tag, nowMs = Date.now()) {
  if (Number(nowMs) < ROUTINE_PUSH_PAUSE_FROM_MS) return false
  const normalizedTag = String(tag || '').toLowerCase()
  const mealPush = normalizedTag.includes('meal')
  const nextClassPush = normalizedTag.includes('next-class') || normalizedTag.includes('period-')
  return mealPush || nextClassPush
}

async function notificationBodyForProfile(body) {
  const studentKey = await readNotificationToneProfile()
  if (studentKey !== PERSONALIZED_STUDENT_KEY) return body
  return `☺️ ${String(body || '').trim()} 잊지 않도록 알려 드릴게요. 오늘도 무리하지 말고 잘 챙겨 주세요. 좋은 하루 보내세요!`.slice(0, 220)
}

function tabFromUrl(value) {
  try {
    const tab = new URL(value || './', self.registration.scope).searchParams.get('tab') || ''
    return ['home', 'todo', 'timetable', 'board', 'study', 'meal', 'academic'].includes(tab) ? tab : ''
  } catch {
    return ''
  }
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { body: event.data?.text() || '' }
  }

  const title = String(payload.title || 'S-Hub').slice(0, 80)
  const body = String(payload.body || '새로운 알림이 있어요.').slice(0, 220)
  const tag = String(payload.tag || `school-push-${Date.now()}`).slice(0, 120)

  event.waitUntil((async () => {
    // Keep every other notification path intact. From 2026-09-01 KST onward,
    // suppress only notifications explicitly tagged as routine meal/next-class pushes.
    if (routinePushPaused(tag)) return

    const target = notificationTarget(tag, body, String(payload.url || './'))
    const displayBody = await notificationBodyForProfile(body)

    await self.registration.showNotification(title, {
      body: displayBody,
      tag,
      icon: './icon-180.png',
      badge: './icon-180.png',
      renotify: false,
      data: { url: target.url, tab: target.tab },
    })
  })())
})

async function routeExistingClient(appClient, targetUrl, targetTab) {
  let routedClient = appClient

  if (targetTab && typeof appClient.navigate === 'function') {
    try {
      routedClient = await appClient.navigate(targetUrl) || appClient
    } catch {
      routedClient = appClient
    }
  }

  try {
    routedClient = await routedClient.focus() || routedClient
  } catch {
    // Keep the original client as a fallback if iOS refuses the focus promise.
  }

  if (targetTab) {
    try {
      routedClient.postMessage({ type: 'SCHOOL_NOTIFICATION_ROUTE', tab: targetTab })
    } catch {
      // The URL navigation above is the fallback route if messaging is unavailable.
    }
  } else if (typeof routedClient.navigate === 'function' && routedClient.url !== targetUrl) {
    await routedClient.navigate(targetUrl).catch(() => {})
  }

  return routedClient
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || './', self.registration.scope).href
  const targetTab = String(event.notification.data?.tab || '') || tabFromUrl(targetUrl)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const appClient = clients.find((client) => client.url.startsWith(self.registration.scope))
      if (appClient) return routeExistingClient(appClient, targetUrl, targetTab)
      return self.clients.openWindow(targetUrl)
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const shouldBypassHttpCache =
          request.mode === 'navigate' ||
          request.destination === 'script' ||
          request.destination === 'style'

        const response = await fetch(request, shouldBypassHttpCache ? { cache: 'no-store' } : undefined)
        if (response.ok) cache.put(request, response.clone())
        return response
      } catch {
        const cached = await cache.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') return cache.match('./')
        throw new Error('Offline and resource is not cached')
      }
    }),
  )
})
