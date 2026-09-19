import {
  normalizeThemePreferences,
  readThemePreferences,
  saveThemePreferences,
} from './theme-preferences.js'
import { ensureSignedIn } from './school-sync.js'

const THEME_SYNC_API_URL = 'https://elhlsqhzjmsfhmawrpqu.supabase.co/functions/v1/student-theme-preferences'
const THEME_SYNC_META_KEY = 'school.themePreferencesSync.v1'
let localThemeRevision = 0

function readSyncMeta() {
  try {
    const value = JSON.parse(localStorage.getItem(THEME_SYNC_META_KEY) || 'null')
    return {
      updatedAt: Math.max(0, Number(value?.updatedAt || 0)),
      dirty: value?.dirty === true,
    }
  } catch {
    return { updatedAt: 0, dirty: false }
  }
}

function writeSyncMeta(value) {
  try {
    localStorage.setItem(THEME_SYNC_META_KEY, JSON.stringify({
      updatedAt: Math.max(0, Number(value?.updatedAt || 0)),
      dirty: value?.dirty === true,
    }))
  } catch {
    // Theme synchronization can retry later even when persistent metadata is unavailable.
  }
}

function syncBrowserThemeColor() {
  const paint = () => {
    const meta = document.getElementById('shub-theme-color')
    if (!meta) return
    const bodyColor = document.body
      ? getComputedStyle(document.body).backgroundColor
      : ''
    const rootColor = getComputedStyle(document.documentElement).backgroundColor
    const color = bodyColor && bodyColor !== 'rgba(0, 0, 0, 0)'
      ? bodyColor
      : rootColor
    if (color && color !== 'rgba(0, 0, 0, 0)') meta.setAttribute('content', color)
  }

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint)
  else paint()
}

function publishTheme(preferences) {
  try {
    window.dispatchEvent(new CustomEvent('school:theme-preferences-synced', {
      detail: normalizeThemePreferences(preferences),
    }))
  } catch {
    // The DOM theme is already applied even when CustomEvent is unavailable.
  }
  syncBrowserThemeColor()
  window.__shubLaunch?.refreshTheme?.()
}

async function authHeaders() {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw new Error('theme-sync/auth-required')
  return {
    authorization: `Bearer ${idToken}`,
    'content-type': 'application/json',
  }
}

async function requestTheme({ method = 'GET', payload = null, signal } = {}) {
  const response = await fetch(THEME_SYNC_API_URL, {
    method,
    headers: await authHeaders(),
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) {
    const error = new Error(String(body?.message || '테마 설정을 동기화하지 못했어요.'))
    error.code = String(body?.error || `theme-sync/http-${response.status || 0}`)
    throw error
  }
  return body
}

async function pushLocalTheme(local, { signal, revision = localThemeRevision } = {}) {
  const body = await requestTheme({
    method: 'POST',
    payload: {
      action: 'save',
      mode: local.mode,
      accent: local.accent,
    },
    signal,
  })
  const updatedAt = Math.max(0, Number(body?.preference?.updatedAt || Date.now()))
  writeSyncMeta({
    updatedAt,
    dirty: localThemeRevision !== revision,
  })
  return local
}

export async function syncThemePreferences({ signal } = {}) {
  const local = readThemePreferences()
  if (navigator.onLine === false) return local

  const revisionAtStart = localThemeRevision
  const meta = readSyncMeta()
  try {
    if (meta.dirty) {
      return await pushLocalTheme(local, { signal, revision: revisionAtStart })
    }

    const body = await requestTheme({ signal })
    const remote = body?.preference
    if (readSyncMeta().dirty || localThemeRevision !== revisionAtStart) {
      return await pushLocalTheme(readThemePreferences(), {
        signal,
        revision: localThemeRevision,
      })
    }
    if (!remote) {
      return await pushLocalTheme(local, { signal, revision: revisionAtStart })
    }

    const next = saveThemePreferences(remote)
    writeSyncMeta({
      updatedAt: Math.max(0, Number(remote.updatedAt || Date.now())),
      dirty: false,
    })
    publishTheme(next)
    return next
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('S-Hub theme sync deferred:', error)
    }
    return local
  }
}

export function queueThemePreferenceSync(preferences = readThemePreferences()) {
  localThemeRevision += 1
  const next = normalizeThemePreferences(preferences)
  writeSyncMeta({ updatedAt: Date.now(), dirty: true })
  publishTheme(next)

  if (navigator.onLine !== false) {
    void syncThemePreferences()
  }
  return next
}

export function saveThemePreferencesSynced(preferences) {
  const next = saveThemePreferences(preferences)
  return queueThemePreferenceSync(next)
}

export function installThemePreferenceSync() {
  if (window.__schoolThemePreferenceSyncInstalled) return
  window.__schoolThemePreferenceSyncInstalled = true

  const refresh = () => {
    if (document.hidden || navigator.onLine === false) return
    void syncThemePreferences()
  }

  window.addEventListener('focus', refresh)
  window.addEventListener('online', refresh)
  document.addEventListener('visibilitychange', refresh)
  window.setTimeout(refresh, 900)
}

export async function preloadThemePreferences({ signal } = {}) {
  return syncThemePreferences({ signal })
}
