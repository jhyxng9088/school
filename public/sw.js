const CACHE_NAME = 'school-shell-v64'
const APP_SHELL = ['./', './manifest.webmanifest', './icon.svg', './school-sheet.css', './reminder-sheet.css', './school-refinements.css', './stage3-polish.css', './school-page-motion.css', './reminder-list-motion.css', './school-home-live.css', './school-academic-supplement.js', './reminder-sheet.js', './school-sheet.js', './school-timetable-motion.js', './school-home-nav.js']

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
