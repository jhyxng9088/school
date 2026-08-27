import { getApp, getApps } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore'
import {
  classKeyFor,
  ensureSignedIn,
  readStudentProfile,
  studentKeyFor,
} from './school-sync'

const PUSH_API_BASE = 'https://school-push-backend.vercel.app/api'
const REMINDER_ACTIVITY_API_BASE = 'https://school-reminder-backend.vercel.app/api'
const DEVICE_ID_KEY = 'school.pushDeviceId.v1'
const PROMPT_SESSION_KEY = 'school.pushPromptSeen.v1'
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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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
  const user = await ensureSignedIn()
  const classId = classKeyFor(profile)
  const studentKey = studentKeyFor(profile)
  if (!classId || !studentKey) throw new Error('Push identity is incomplete')

  const identityRef = doc(db, 'users', user.uid)
  let snapshot = null
  for (let attempt = 0; attempt < 16; attempt += 1) {
    snapshot = await getDoc(identityRef)
    if (snapshot.exists()) break
    await sleep(250)
  }
  if (!snapshot?.exists()) throw new Error('School identity was not initialized')

  const existing = snapshot.data() || {}
  if (
    existing.classId !== classId
    || existing.studentKey !== studentKey
    || existing.name !== profile.name
  ) {
    throw new Error('Push identity does not match the signed-in student')
  }

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
  const response = await fetch(`${PUSH_API_BASE}/push-public-key`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Push public key request failed: ${response.status}`)
  const payload = await response.json()
  const key = String(payload?.publicKey || '')
  if (!key) throw new Error('Push public key is missing')
  return key
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
  await setDoc(
    doc(db, 'classes', identity.classId, 'pushSubscriptions', `${identity.studentKey}-${currentDeviceId}`),
    {
      studentKey: identity.studentKey,
      deviceId: currentDeviceId,
      endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent.slice(0, 350),
      updatedAt: Date.now(),
    },
    { merge: true },
  )

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
      left: max(16px, env(safe-area-inset-left));
      right: max(16px, env(safe-area-inset-right));
      bottom: calc(86px + env(safe-area-inset-bottom));
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 13px 13px 15px;
      border: 1px solid rgba(0, 0, 0, .08);
      border-radius: 20px;
      background: rgba(250, 250, 252, .94);
      color: #111114;
      box-shadow: 0 12px 38px rgba(0, 0, 0, .12);
      -webkit-backdrop-filter: blur(24px) saturate(1.2);
      backdrop-filter: blur(24px) saturate(1.2);
      opacity: 0;
      transform: translate3d(0, 10px, 0) scale(.985);
      transition: opacity .42s ease, transform .52s cubic-bezier(.16,1,.3,1);
    }
    .school-push-prompt.is-open { opacity: 1; transform: translate3d(0,0,0) scale(1); }
    .school-push-prompt-copy { min-width: 0; flex: 1; }
    .school-push-prompt-copy strong { display: block; font-size: 14px; line-height: 1.25; letter-spacing: -.02em; }
    .school-push-prompt-copy span { display: block; margin-top: 3px; font-size: 12px; line-height: 1.35; opacity: .62; }
    .school-push-enable {
      flex: none;
      border: 0;
      border-radius: 14px;
      padding: 9px 12px;
      background: #111114;
      color: #fff;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
    }
    .school-push-close {
      flex: none;
      width: 30px;
      height: 30px;
      border: 0;
      padding: 0;
      border-radius: 50%;
      background: rgba(0, 0, 0, .06);
      color: inherit;
      font: inherit;
      font-size: 17px;
      line-height: 30px;
      opacity: .62;
    }
    @media (prefers-color-scheme: dark) {
      .school-push-prompt { border-color: rgba(255,255,255,.12); background: rgba(27,27,30,.94); color: #f5f5f7; }
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
  if (!pushSupported() || Notification.permission !== 'default') return
  if (IOS && !isStandalone()) return
  if (sessionStorage.getItem(PROMPT_SESSION_KEY) === 'shown') return
  if (localStorage.getItem(CONTACT_NOTICE_KEY) !== 'done') {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }
  if (document.querySelector('.first-run-notice-layer, .school-push-prompt')) {
    window.setTimeout(() => maybeShowPermissionPrompt(profile), 900)
    return
  }

  sessionStorage.setItem(PROMPT_SESSION_KEY, 'shown')
  installPromptStyles()
  const layer = document.createElement('section')
  layer.className = 'school-push-prompt'
  layer.setAttribute('role', 'status')
  layer.innerHTML = `
    <div class="school-push-prompt-copy">
      <strong>알림 켜기</strong>
      <span>시간표 변경 · 다음 수업 · 급식을 알려줄게.</span>
    </div>
    <button class="school-push-enable" type="button">켜기</button>
    <button class="school-push-close" type="button" aria-label="나중에">×</button>
  `

  layer.querySelector('.school-push-close')?.addEventListener('click', () => removePrompt(layer))
  layer.querySelector('.school-push-enable')?.addEventListener('click', async () => {
    const button = layer.querySelector('.school-push-enable')
    if (button) button.disabled = true
    try {
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
    const dispatchUrl = event.entityType === 'reminder'
      ? `${REMINDER_ACTIVITY_API_BASE}/activity-dispatch`
      : `${PUSH_API_BASE}/push-dispatch`
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

function watchOwnActivity(profile) {
  const classId = classKeyFor(profile)
  const myStudentKey = studentKeyFor(profile)
  if (!classId || !myStudentKey) return () => {}

  const startedAt = Date.now()
  let ready = false
  return onSnapshot(
    collection(db, 'classes', classId, 'activity'),
    (snapshot) => {
      if (!ready) {
        ready = true
        return
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') return
        const value = change.doc.data() || {}
        const entityType = String(value.entityType || '')
        const updatedAt = Number(value.updatedAt || 0)
        if (!['reminder', 'timetable'].includes(entityType)) return
        if (!updatedAt || updatedAt < startedAt - 5000 || value.actorStudentKey !== myStudentKey) return
        claimAndDispatch(profile, {
          entityType,
          entityId: String(value.entityId || ''),
          sourceId: change.doc.id,
          actorStudentKey: String(value.actorStudentKey || ''),
          action: value.action === 'added' ? 'added' : 'edited',
          updatedAt,
        }).catch((error) => console.error('Class activity push failed:', error))
      })
    },
    (error) => console.error('Class activity push listener failed:', error),
  )
}

function watchOwnAcademic(profile) {
  const classId = classKeyFor(profile)
  const myStudentKey = studentKeyFor(profile)
  if (!classId || !myStudentKey) return () => {}

  const startedAt = Date.now()
  let ready = false
  return onSnapshot(
    collection(db, 'classes', classId, 'academicEvents'),
    (snapshot) => {
      if (!ready) {
        ready = true
        return
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') return
        const value = change.doc.data() || {}
        const updatedAt = Number(value.updatedAt || 0)
        if (!updatedAt || updatedAt < startedAt - 5000 || value.lastEditedByStudentKey !== myStudentKey) return
        claimAndDispatch(profile, {
          entityType: 'academic',
          entityId: change.doc.id,
          sourceId: change.doc.id,
          actorStudentKey: String(value.lastEditedByStudentKey || ''),
          action: value.lastAction === 'added' ? 'added' : 'edited',
          updatedAt,
        }).catch((error) => console.error('Academic push failed:', error))
      })
    },
    (error) => console.error('Academic push listener failed:', error),
  )
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

  watchOwnActivity(profile)
  watchOwnAcademic(profile)

  if (Notification.permission === 'granted') {
    ensurePushSubscription(profile).catch((error) => console.error('Push subscription refresh failed:', error))
  } else if (Notification.permission === 'default') {
    maybeShowPermissionPrompt(profile)
  }
}

startPushBridge().catch((error) => console.error('Push bridge failed:', error))
