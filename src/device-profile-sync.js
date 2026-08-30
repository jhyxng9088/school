import { ensureSignedIn, readStudentProfile } from './school-sync'

const DEVICE_API = 'https://school-reminder-backend.vercel.app/api/device-register'
const CACHE_KEY = 'school.deviceProfile.v1'
let syncing = false

function detectBrowser(ua) {
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/EdgiOS|Edg\//i.test(ua)) return 'edge'
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox'
  if (/CriOS|Chrome/i.test(ua)) return 'chrome'
  if (/Safari/i.test(ua)) return 'safari'
  return 'other'
}

function detectDevice() {
  const ua = navigator.userAgent || ''
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  const iPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  const iPhone = /iPhone|iPod/i.test(ua)
  const android = /Android/i.test(ua)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

  if (iPad) return { deviceType: 'ipad', deviceLabel: 'iPad', platform, browser: detectBrowser(ua), displayMode: standalone ? 'standalone' : 'browser' }
  if (iPhone) return { deviceType: 'iphone', deviceLabel: 'iPhone', platform, browser: detectBrowser(ua), displayMode: standalone ? 'standalone' : 'browser' }
  if (android) return { deviceType: 'android', deviceLabel: /SM-|Samsung/i.test(ua) ? 'Android · Samsung' : 'Android', platform, browser: detectBrowser(ua), displayMode: standalone ? 'standalone' : 'browser' }
  return { deviceType: 'desktop', deviceLabel: 'PC / Mac', platform, browser: detectBrowser(ua), displayMode: standalone ? 'standalone' : 'browser' }
}

function signature(device) {
  return [device.deviceType, device.deviceLabel, device.platform, device.browser, device.displayMode].join('|')
}

async function syncDeviceProfile() {
  if (syncing || navigator.onLine === false || !readStudentProfile()) return
  const device = detectDevice()
  const nextSignature = signature(device)
  if (localStorage.getItem(CACHE_KEY) === nextSignature) return

  syncing = true
  try {
    const user = await ensureSignedIn()
    const token = await user.getIdToken()
    const response = await fetch(DEVICE_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(device),
    })
    if (!response.ok) return
    localStorage.setItem(CACHE_KEY, nextSignature)
  } catch {
    // Device metadata is optional and must never block S-Hub startup.
  } finally {
    syncing = false
  }
}

function scheduleSync() {
  window.setTimeout(() => { void syncDeviceProfile() }, 1200)
}

window.addEventListener('online', scheduleSync)
window.addEventListener('school:student-profile-saved', scheduleSync)
window.addEventListener('focus', scheduleSync)
scheduleSync()
