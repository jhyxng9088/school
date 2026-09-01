import { readStudentProfile, studentKeyFor } from './school-sync.js'

const CACHE_ROOT = ['school', 'preview', 'fast-cache', 'v1'].join('.')
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function previewFastCacheScopeKey() {
  try {
    return String(studentKeyFor(readStudentProfile()) || '')
  } catch {
    return ''
  }
}

function storageKey(area, variant = '') {
  const scopeKey = previewFastCacheScopeKey()
  const cleanArea = String(area || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
  const cleanVariant = String(variant || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30)
  if (!scopeKey || !cleanArea) return ''
  return [CACHE_ROOT, scopeKey, cleanArea, cleanVariant].filter(Boolean).join('.')
}

export function readPreviewPersistentCache(area, variant = '') {
  if (typeof localStorage === 'undefined') return null
  const key = storageKey(area, variant)
  if (!key) return null
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    const savedAt = Number(stored?.savedAt || 0)
    if (!stored || typeof stored !== 'object' || !savedAt || Date.now() - savedAt > CACHE_MAX_AGE_MS) {
      if (stored) localStorage.removeItem(key)
      return null
    }
    return stored.data && typeof stored.data === 'object' ? stored.data : null
  } catch {
    try { localStorage.removeItem(key) } catch { /* no-op */ }
    return null
  }
}

export function writePreviewPersistentCache(area, variant = '', data = null) {
  if (typeof localStorage === 'undefined' || !data || typeof data !== 'object') return false
  const key = storageKey(area, variant)
  if (!key) return false
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }))
    return true
  } catch {
    return false
  }
}
