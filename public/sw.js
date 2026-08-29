const CACHE_NAME = 'school-shell-v155'
const NOTIFICATION_PROFILE_CACHE = 'school-notification-profile-v1'
const NOTIFICATION_PROFILE_URL = new URL('./__notification-tone-profile__', self.registration.scope).href
const PERSONALIZED_STUDENT_KEY = 'student-a63dc064d4c5227e'
const APP_SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-android.svg', './school-refinements.css', './stage3-polish.css', './school-page-motion.css', './reminder-list-motion.css', './school-home-live.css', './first-run-notice.css', './feature-tour-sequences.css', './samsung-nav-icon-fixes.css', './school-timetable-motion.js', './school-home-nav.js', './school-home-live.js', './feature-tour-ai-orb.js', './first-run-notice.js', './notification-routing.js', './notification-tone-profile.js']
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
  const cache = await caches.open(NOTIFICATION_PROFILE_CACHE)
  const response = await cache.match(NOTIFICATION_PROFILE_URL)
  return response ? String(await response.text()).trim() : ''
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_NOTIFICATION_TONE_PROFILE') {
    event.waitUntil(saveNotificationToneProfile(event.data.studentKey))
  }
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  const acceptsHtml = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')
  if (acceptsHtml) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy)).catch(() => {})
          return response
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request)),
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'S-Hub', body: event.data.text() }
  }

  const showNotification = async () => {
    const studentKey = await readNotificationToneProfile().catch(() => '')
    const now = Date.now()
    const routinePushPaused = now >= ROUTINE_PUSH_PAUSE_FROM_MS
    const type = String(payload.type || '')
    if (routinePushPaused && (type === 'next_class' || type === 'meal')) return

    const personalized = studentKey && studentKey === PERSONALIZED_STUDENT_KEY
    const body = personalized && payload.gentleBody ? payload.gentleBody : payload.body

    await self.registration.showNotification(payload.title || 'S-Hub', {
      body: body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: payload.tag || undefined,
      data: payload.data || {},
    })
  }

  event.waitUntil(showNotification())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL('./', self.registration.scope).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(target)
      return undefined
    }),
  )
})
