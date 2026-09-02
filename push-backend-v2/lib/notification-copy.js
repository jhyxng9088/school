const LEADING_LIST_MARKERS = /^[\s\u2022\u00b7\u25cf\u25e6\u25aa\u25ab\u2013\u2014-]+/u

export function cleanNotificationLabel(value, fallback = '') {
  const clean = String(value || '')
    .trim()
    .replace(LEADING_LIST_MARKERS, '')
    .trim()
  if (clean) return clean.slice(0, 80)

  return String(fallback || '')
    .trim()
    .replace(LEADING_LIST_MARKERS, '')
    .trim()
    .slice(0, 80)
}
