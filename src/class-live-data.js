const latestByKey = new Map()
const listenersByKey = new Map()

function channelKey(channel, scope) {
  const cleanChannel = String(channel || '').trim()
  const cleanScope = String(scope || '').trim()
  return cleanChannel && cleanScope ? `${cleanChannel}:${cleanScope}` : ''
}

export function publishClassLiveData(channel, scope, value) {
  const key = channelKey(channel, scope)
  if (!key) return
  latestByKey.set(key, value)
  const listeners = listenersByKey.get(key)
  if (!listeners?.size) return
  listeners.forEach((listener) => {
    try { listener(value) } catch (error) { console.error('Class live-data listener failed:', error) }
  })
}

export function subscribeClassLiveData(channel, scope, listener, { replay = true } = {}) {
  const key = channelKey(channel, scope)
  if (!key || typeof listener !== 'function') return () => {}
  let listeners = listenersByKey.get(key)
  if (!listeners) {
    listeners = new Set()
    listenersByKey.set(key, listeners)
  }
  listeners.add(listener)

  if (replay && latestByKey.has(key)) {
    queueMicrotask(() => {
      if (listenersByKey.get(key)?.has(listener)) listener(latestByKey.get(key))
    })
  }

  return () => {
    const current = listenersByKey.get(key)
    current?.delete(listener)
    if (!current?.size) listenersByKey.delete(key)
  }
}

export function clearClassLiveDataScope(scope) {
  const suffix = `:${String(scope || '').trim()}`
  if (suffix === ':') return
  for (const key of latestByKey.keys()) {
    if (key.endsWith(suffix)) latestByKey.delete(key)
  }
}
