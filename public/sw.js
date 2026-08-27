const CACHE_NAME = 'school-shell-v129'
const APP_SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-android.svg', './school-refinements.css', './stage3-polish.css', './school-page-motion.css', './reminder-list-motion.css', './school-home-live.css', './first-run-notice.css', './samsung-apple-nav-icons.css', './samsung-nav-icon-fixes.css', './samsung-nav-meal.svg', './samsung-nav-academic.svg', './school-timetable-motion.js', './school-home-nav.js', './first-run-notice.js', './notification-routing.js']

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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

function notificationRoute(tag, body, fallbackUrl = './') {
  const normalizedTag = String(tag || '').toLowerCase()
  const normalizedBody = String(body || '')

  if (normalizedTag.includes('reminder') || normalizedBody.includes('리마인더')) return './?tab=todo'
  if (normalizedTag.includes('timetable') || normalizedBody.includes('시간표')) return './?tab=timetable'
  if (normalizedTag.includes('academic') || normalizedBody.includes('학사일정')) return './?tab=academic'
  if (normalizedTag.includes('meal') || normalizedBody.includes('급식') || normalizedBody.includes('점심시간')) return './?tab=meal'
  if (normalizedTag.includes('next-class') || normalizedTag.includes('period-') || normalizedBody.includes('다음 시간은')) return './?tab=home'
  return fallbackUrl
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { body: event.data?.text() || '' }
  }

  const title = String(payload.title || 'S-Hub').slice(0, 80)
  const body = String(payload.body || '새로운 알림이 있어.').slice(0, 220)
  const tag = String(payload.tag || `school-push-${Date.now()}`).slice(0, 120)
  const url = notificationRoute(tag, body, String(payload.url || './'))

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: './icon-180.png',
    badge: './icon-180.png',
    renotify: false,
    data: { url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || './', self.registration.scope).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const appClient = clients.find((client) => client.url.startsWith(self.registration.scope))
      if (appClient) {
        if (typeof appClient.navigate === 'function' && appClient.url !== targetUrl) {
          await appClient.navigate(targetUrl).catch(() => {})
        }
        return appClient.focus()
      }
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
