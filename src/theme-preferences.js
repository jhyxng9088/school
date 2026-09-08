export const THEME_STORAGE_KEY = 'school.themePreferences.v1'

export const THEME_MODES = [
  { id: 'system', label: '기기 설정' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
]

export const THEME_ACCENTS = [
  { id: 'default', label: '기본' },
  { id: 'gray', label: '회색' },
  { id: 'pink', label: '핑크' },
  { id: 'blue', label: '블루' },
  { id: 'lavender', label: '라벤더' },
  { id: 'mint', label: '민트' },
  { id: 'peach', label: '피치' },
  { id: 'avocado', label: '아보카도' },
  { id: 'cream', label: '크림' },
  { id: 'ivory', label: '아이보리' },
]

const MODE_IDS = new Set(THEME_MODES.map((item) => item.id))
const ACCENT_IDS = new Set(THEME_ACCENTS.map((item) => item.id))
const LEGACY_ACCENT_ALIASES = Object.freeze({ sand: 'cream' })

function applyThemeChangeWithoutBackgroundLag(preferences, root) {
  if (!root?.style || typeof globalThis.getComputedStyle !== 'function') {
    return applyThemePreferences(preferences, root)
  }

  const transitionProperties = globalThis.getComputedStyle(root).transitionProperty
    .split(',')
    .map((property) => property.trim())
    .filter(Boolean)

  if (!transitionProperties.includes('--bg')) {
    return applyThemePreferences(preferences, root)
  }

  const previousInlineTransitionProperty = root.style.transitionProperty
  const immediateBackgroundProperties = transitionProperties.filter((property) => property !== '--bg')
  root.style.transitionProperty = immediateBackgroundProperties.join(', ') || 'none'

  const next = applyThemePreferences(preferences, root)

  const restoreTransitionOwner = () => {
    if (previousInlineTransitionProperty) {
      root.style.transitionProperty = previousInlineTransitionProperty
    } else {
      root.style.removeProperty('transition-property')
    }
  }

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(restoreTransitionOwner)
    })
  } else {
    restoreTransitionOwner()
  }

  return next
}

export function normalizeThemePreferences(value) {
  const source = value && typeof value === 'object' ? value : {}
  const requestedAccent = LEGACY_ACCENT_ALIASES[source.accent] || source.accent
  return {
    mode: MODE_IDS.has(source.mode) ? source.mode : 'system',
    accent: ACCENT_IDS.has(requestedAccent) ? requestedAccent : 'default',
  }
}

export function readThemePreferences(storage = globalThis.localStorage) {
  if (!storage) return normalizeThemePreferences(null)
  try {
    return normalizeThemePreferences(JSON.parse(storage.getItem(THEME_STORAGE_KEY) || 'null'))
  } catch {
    return normalizeThemePreferences(null)
  }
}

export function applyThemePreferences(preferences, root = globalThis.document?.documentElement) {
  const next = normalizeThemePreferences(preferences)
  if (!root) return next

  if (next.mode === 'system') delete root.dataset.themeMode
  else root.dataset.themeMode = next.mode

  if (next.accent === 'default') delete root.dataset.themeAccent
  else root.dataset.themeAccent = next.accent

  return next
}

export function saveThemePreferences(preferences, storage = globalThis.localStorage, root = globalThis.document?.documentElement) {
  const next = applyThemeChangeWithoutBackgroundLag(preferences, root)
  try {
    storage?.setItem(THEME_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Theme selection still applies for the current session when storage is unavailable.
  }
  return next
}

export function initializeThemePreferences() {
  return applyThemePreferences(readThemePreferences())
}
