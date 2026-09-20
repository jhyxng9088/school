import { getApp, getApps } from 'firebase/app'
import {
  deleteDoc,
  doc,
  getFirestore,
  runTransaction,
  setDoc,
} from 'firebase/firestore'
import {
  classKeyFor,
  ensureSignedIn,
  readStudentProfile,
  studentKeyFor,
} from './school-sync'
import { subscribeClassLiveData } from './class-live-data.js'

const PUSH_API_BASE = 'https://school-reminder-backend.vercel.app/api'
const PUSH_MIRROR_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/push-subscription-mirror'
const DEVICE_ID_KEY = 'school.pushDeviceId.v1'
const CONTACT_NOTICE_KEY = 'school.contactNotice.v1'
const IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)

const syncApp = getApps().some((app) => app.name === 'school-sync')
  ? getApp('school-sync')
  : null
const db = syncApp ? getFirestore(syncApp) : null

function pushSupported() {
  return Boolean(
    db
      && window.isSecureContext
      && 'serviceWorker' in navigator
      && 'Notification' in window
      && 'PushManager' in window,
  )
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

function waitForAppShell() {
  if (document.querySelector('.app-shell')) return Promise.resolve()
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.app-shell')) return
      observer.disconnect()
      resolve()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}

function deviceId() {
  let value = localStorage.getItem(DEVICE_ID_KEY)
  if (value && /^[a-zA-Z0-9_-]{12,48}$/.test(value)) return value
  value = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`
  value = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
  localStorage.setItem(DEVICE_ID_KEY, value)
  return value
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

function arrayBufferToBase64Url(buffer) {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function resolveIdentity(profile) {
  // ensureSignedIn() is the canonical identity verifier: it creates a missing
  // users/{uid} document and rejects any stored profile mismatch before it
  // resolves. Re-reading the same document here only duplicated Firestore reads.
  const user = await ensureSignedIn()
  const classId = classKeyFor(profile)
  const studentKey = studentKeyFor(profile)
  if (!classId || !studentKey) throw new Error('Push identity is incomplete')
  return { user, classId, studentKey }
}

async function serviceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    updateViaCache: 'none',
  })
}

async function fetchPublicKey() {
  const response = await fetch(`${PUSH_API_BASE}/activity-dispatch`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Push public key request failed: ${response.status}`)
  const payload = await response.json()
  const key = String(payload?.publicKey || '')
  if (!key) throw new Error('Push public key is missing')
  return key
}

async function mirrorPushSubscription(identity, payload) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2200)
  try {
    const idToken = await identity.user.getIdToken()
    const response = await fetch(PUSH_MIRROR_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        classId: identity.classId,
      }),
      cache: 'no-store',
      keepalive: true,
      signal: controller.signal,
    })
    if (!response.ok) {
      console.warn('Supabase push subscription mirror skipped:', response.status)
      return false
    }
    return true
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('Supabase push subscription mirror unavailable; Firestore remains primary.', error)
    }
    return false
  } finally {
    window.clearTimeout(timeout)
  }
}

async function ensurePushSubscription(profile) {
  if (!pushSupported() || Notification.permission !== 'granted') return null
  if (IOS && !isStandalone()) return null

  const identity = await resolveIdentity(profile)
  const registration = await serviceWorkerRegistration()
  const publicKey = await fetchPublicKey()
  let subscription = await registration.pushManager.getSubscription()

  const currentKey = subscription?.options?.applicationServerKey
    ? arrayBufferToBase64Url(subscription.options.applicationServerKey)
    : ''
  if (subscription && currentKey && currentKey !== publicKey) {
    await subscription.unsubscribe().catch(() => false)
    subscription = null
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const serialized = subscription.toJSON()
  const endpoint = String(serialized.endpoint || subscription.endpoint || '')
  const p256dh = String(serialized.keys?.p256dh || '')
  const auth = String(serialized.keys?.auth || '')
  if (!endpoint || !p256dh || !auth) throw new Error('Push subscription is incomplete')

  const currentDeviceId = deviceId()
  const updatedAt = Date.now()
  const subscriptionPayload = {
    studentKey: identity.studentKey,
    deviceId: currentDeviceId,
    endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent.slice(0, 350),
    updatedAt,
  }

  // Firestore remains the canonical push-subscription store during migration.
  // The Supabase write is only a shadow copy and can never block registration.
  await setDoc(
    doc(db, 'classes', identity.classId, 'pushSubscriptions', `${identity.studentKey}-${currentDeviceId}`),
    subscriptionPayload,
    { merge: true },
  )
  void mirrorPushSubscription(identity, subscriptionPayload)

  return subscription
}

function installPromptStyles() {
  if (document.getElementById('school-push-prompt-style')) return
  const style = document.createElement('style')
  style.id = 'school-push-prompt-style'
  style.textContent = `
    .school-push-prompt {
      position: fixed;
      z-index: 10020;
      left: 50%;
      bottom: calc(96px + env(safe-area-inset-bottom));
      width: min(420px, calc(100vw - 32px));
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 20px;
      border: 1px solid rgba(0, 0, 0, .08);
      border-radius: 24px;
      background: rgba(250, 250, 252, .97);
      color: #111114;
      box-shadow: 0 18px 54px rgba(0, 0, 0, .18);
      -webkit-backdrop-filter: blur(24px) saturate(1.2);
      backdrop-filter: blur(24px) saturate(1.2);
      opacity: 0;
      transform: translate3d(-50%, 14px, 0) scale(.985);
      transition: opacity .42s ease, transform .52s cubic-bezier(.16,1,.3,1);
    }
    .school-push-prompt.is-open { opacity: 1; transform: translate3d(-50%,0,0) scale(1); }
    .school-push-prompt-copy { min-width: 0; }
    .school-push-prompt-copy strong { display: block; font-size: 18px; line-height: 1.25; letter-spacing: -.025em; }
    .school-push-prompt-copy span { display: block; margin-top: 7px; font-size: 13px; line-height: 1.45; opacity: .65; }
    .school-push-enable {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 12px 14px;
      background: #111114;
      color: #fff;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
    }
    .school-push-close {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(0, 0, 0, .055);
      color: inherit;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      opacity: .72;
    }
    @media (prefers-color-scheme: dark) {
      .school-push-prompt { border-color: rgba(255,255,255,.12); background: rgba(27,27,30,.97); color: #f5f5f7; }
      .school-push-enable { background: #f5f5f7; color: #111114; }
      .school-push-close { background: rgba(255,255,255,.08); }
    }
    @media (prefers-reduced-motion: reduce) { .school-push-prompt { transition-duration: .01ms; } }
  `
  document.head.appendChild(style)
}

function removePrompt(layer) {
  if (!layer?.isConnected) return
  layer.classList.remove('is-open')
  window.setTimeout(() => layer.remove(), 420)
}

async function maybeShowPermissionPrompt(profile) {
  if (!pushSupported() || Notification.permission === 'granted') return
  if (IOS && !isStandalone()) return
  if (document.hidden) return
  if (localStorage.getItem(CONTACT_NOTICE_KEY) !== 'done') {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }
  if (document.querySelector('.first-run-notice-layer, .school-push-prompt')) {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }

  const permissionDenied = Notification.permission === 'denied'
  installPromptStyles()
  const layer = document.createElement('section')
  layer.className = 'school-push-prompt'
  layer.setAttribute('role', 'status')
  layer.innerHTML = `
    <div class="school-push-prompt-copy">
      <strong>${permissionDenied ? 'S-Hub 알림이 꺼져 있어요' : 'S-Hub 알림을 켜시겠어요?'}</strong>
      <span>${permissionDenied ? '기기 설정에서 S-Hub 알림을 허용해 주세요.' : '새 리마인더와 시간표 변경 같은 중요한 학교 소식을 바로 알려 드려요.'}</span>
    </div>
    <button class="school-push-enable" type="button">${permissionDenied ? '확인' : '알림 켜기'}</button>
    <button class="school-push-close" type="button">나중에</button>
  `

  layer.querySelector('.school-push-close')?.addEventListener('click', () => removePrompt(layer))
  layer.querySelector('.school-push-enable')?.addEventListener('click', async () => {
    const button = layer.querySelector('.school-push-enable')
    if (button) button.disabled = true
    try {
      if (permissionDenied) {
        removePrompt(layer)
        return
      }
      const permission = await Notification.requestPermission()
      if (permission === 'granted') await ensurePushSubscription(profile)
      removePrompt(layer)
    } catch (error) {
      console.error('Push permission setup failed:', error)
      removePrompt(layer)
    } finally {
      if (button) button.disabled = false
    }
  })

  document.body.appendChild(layer)
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')))
}

function installPermissionPromptEntryWatcher(profile) {
  let leftApp = false

  const refreshPermissionState = () => {
    if (document.hidden) {
      leftApp = true
      return
    }
    if (!leftApp) return
    leftApp = false

    if (Notification.permission === 'granted') {
      const layer = document.querySelector('.school-push-prompt')
      if (layer) removePrompt(layer)
      ensurePushSubscription(profile).catch((error) => console.error('Push subscription refresh failed:', error))
      return
    }
    maybeShowPermissionPrompt(profile)
  }

  document.addEventListener('visibilitychange', refreshPermissionState)
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || document.hidden) return
    leftApp = true
    refreshPermissionState()
  })
}

async function hashEvent(value) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40)
  }
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

async function claimAndDispatch(profile, event) {
  const identity = await resolveIdentity(profile)
  if (event.actorStudentKey !== identity.studentKey) return

  const fingerprint = [
    identity.classId,
    event.entityType,
    event.entityId,
    event.sourceId,
    event.action,
    event.updatedAt,
  ].join('|')
  const claimRef = doc(
    db,
    'classes',
    identity.classId,
    'pushDispatchClaims',
    `activity-${await hashEvent(fingerprint)}`,
  )

  const claimed = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(claimRef)
    if (snapshot.exists()) return false
    transaction.set(claimRef, {
      kind: 'activity',
      actorStudentKey: identity.studentKey,
      createdAt: Date.now(),
    })
    return true
  })
  if (!claimed) return

  try {
    const idToken = await identity.user.getIdToken()
    const dispatchUrl = `${PUSH_API_BASE}/activity-dispatch`
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        entityType: event.entityType,
        entityId: event.entityId,
        sourceId: event.sourceId,
        action: event.action,
        updatedAt: event.updatedAt,
      }),
    })
    if (!response.ok) throw new Error(`Push dispatch failed: ${response.status}`)
  } catch (error) {
    await deleteDoc(claimRef).catch(() => {})
    throw error
  }
}

function watchCanonicalPushFallback(profile) {
  const classId = classKeyFor(profile)
  const myStudentKey = studentKeyFor(profile)
  if (!classId || !myStudentKey) return () => {}

  // push-dispatch-direct.js handles the immediate local commit event. These
  // subscriptions are a no-extra-Firestore-read fallback that reuse the app's
  // canonical activity/academic listeners instead of opening duplicate ones.
  const startedAt = Date.now()
  let activityReady = false
  let academicReady = false

  const stopActivity = subscribeClassLiveData('activity', classId, (activity) => {
    if (!activityReady) {
      activityReady = true
      return
    }
    Object.values(activity || {}).forEach((value) => {
      const entityType = String(value?.entityType || '')
      const updatedAt = Number(value?.updatedAt || 0)
      if (!['reminder', 'timetable'].includes(entityType)) return
      if (!updatedAt || updatedAt < startedAt - 5000 || value?.actorStudentKey !== myStudentKey) return
      claimAndDispatch(profile, {
        entityType,
        entityId: String(value?.entityId || ''),
        sourceId: `${entityType}:${String(value?.entityId || '')}`,
        actorStudentKey: String(value?.actorStudentKey || ''),
        action: value?.action === 'added' ? 'added' : 'edited',
        updatedAt,
      }).catch((error) => console.error('Class activity push fallback failed:', error))
    })
  })

  const stopAcademic = subscribeClassLiveData('academic', classId, (events) => {
    if (!academicReady) {
      academicReady = true
      return
    }
    ;(Array.isArray(events) ? events : []).forEach((value) => {
      const updatedAt = Number(value?.updatedAt || 0)
      if (!updatedAt || updatedAt < startedAt - 5000 || value?.lastEditedByStudentKey !== myStudentKey) return
      claimAndDispatch(profile, {
        entityType: 'academic',
        entityId: String(value?.id || ''),
        sourceId: String(value?.id || ''),
        actorStudentKey: String(value?.lastEditedByStudentKey || ''),
        action: value?.lastAction === 'added' ? 'added' : 'edited',
        updatedAt,
      }).catch((error) => console.error('Academic push fallback failed:', error))
    })
  })

  return () => {
    stopActivity()
    stopAcademic()
  }
}

async function startPushBridge() {
  if (!pushSupported()) return
  await waitForAppShell()
  const profile = readStudentProfile()
  if (!profile) return

  try {
    await resolveIdentity(profile)
  } catch (error) {
    console.error('Push identity setup failed:', error)
    return
  }

  watchCanonicalPushFallback(profile)
  installPermissionPromptEntryWatcher(profile)

  if (Notification.permission === 'granted') {
    ensurePushSubscription(profile).catch((error) => console.error('Push subscription refresh failed:', error))
  } else {
    maybeShowPermissionPrompt(profile)
  }
}

startPushBridge().catch((error) => console.error('Push bridge failed:', error))
