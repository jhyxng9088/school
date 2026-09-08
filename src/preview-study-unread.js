import { studentKeyFor } from './school-sync.js'
import { loadPreviewStudyEvents, savePreviewStudySeen } from './preview-study-client.js'
import { subscribePreviewStudyRealtime } from './preview-study-realtime.js'

const STORAGE_PREFIX = 'school.studyUnread.v2:'
const controllers = new Map()

function identityKey(profile) {
  return String(studentKeyFor(profile) || 'unknown').slice(0, 160)
}

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`
}

function blankState() {
  return {
    initialized: false,
    hasUnread: false,
    latestAt: 0,
    seenAt: 0,
    eventCursor: 0,
    seenCursor: 0,
    pendingSeenAt: 0,
    pendingSeenCursor: 0,
    revision: 0,
  }
}

function loadStored(key) {
  if (typeof localStorage === 'undefined') return blankState()
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || '{}')
    const initialized = Boolean(parsed?.initialized)
    const latestAt = Math.max(0, Number(parsed?.latestAt || 0))
    const seenAt = Math.max(0, Number(parsed?.seenAt || 0))
    const eventCursor = Math.max(0, Math.floor(Number(parsed?.eventCursor || 0)))
    const pendingSeenCursor = Math.max(0, Math.floor(Number(parsed?.pendingSeenCursor || 0)))
    const legacyUnread = initialized && latestAt > seenAt
    const hasUnread = typeof parsed?.hasUnread === 'boolean' ? parsed.hasUnread : legacyUnread
    const storedSeenCursor = Math.max(0, Math.floor(Number(parsed?.seenCursor || 0)))
    const seenCursor = storedSeenCursor || (initialized && !hasUnread ? eventCursor : pendingSeenCursor)
    return {
      initialized,
      hasUnread,
      latestAt,
      seenAt,
      eventCursor,
      seenCursor,
      pendingSeenAt: Math.max(0, Number(parsed?.pendingSeenAt || 0)),
      pendingSeenCursor,
      revision: 0,
    }
  } catch {
    return blankState()
  }
}

function persist(controller) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKey(controller.identityKey), JSON.stringify({
      initialized: controller.state.initialized,
      hasUnread: controller.state.hasUnread,
      latestAt: controller.state.latestAt,
      seenAt: controller.state.seenAt,
      eventCursor: controller.state.eventCursor,
      seenCursor: controller.state.seenCursor,
      pendingSeenAt: controller.state.pendingSeenAt,
      pendingSeenCursor: controller.state.pendingSeenCursor,
    }))
  } catch {
    // Keep the live state even when storage is unavailable.
  }
}

function snapshot(controller) {
  return {
    hasUnread: controller.state.initialized && Boolean(controller.state.hasUnread),
    latestAt: Math.max(0, Number(controller.state.latestAt || 0)),
    seenAt: Math.max(0, Number(controller.state.seenAt || 0)),
    eventCursor: Math.max(0, Number(controller.state.eventCursor || 0)),
    seenCursor: Math.max(0, Number(controller.state.seenCursor || 0)),
    revision: controller.state.revision,
  }
}

function notify(controller) {
  controller.state.revision += 1
  const next = snapshot(controller)
  for (const listener of [...controller.listeners]) listener(next)
}

function latestOtherEvent(events, myStudentKey) {
  let cursor = 0
  let startedAt = 0
  for (const event of Array.isArray(events) ? events : []) {
    if (String(event?.studentKey || '') === myStudentKey) continue
    const eventCursor = Math.max(0, Math.floor(Number(event?.cursor || 0)))
    if (eventCursor > cursor) cursor = eventCursor
    startedAt = Math.max(startedAt, Number(event?.startedAt || 0))
  }
  return { cursor, startedAt }
}

function applyServerReadState(controller, readState, latestCursor) {
  if (readState?.initialized !== true) return false
  const nextSeenAt = Math.max(
    0,
    Number(controller.state.seenAt || 0),
    Number(readState.seenAt || 0),
    Number(controller.state.pendingSeenAt || 0),
  )
  const nextSeenCursor = Math.max(
    0,
    Number(controller.state.seenCursor || 0),
    Number(readState.seenCursor || 0),
    Number(controller.state.pendingSeenCursor || 0),
  )
  const nextEventCursor = Math.max(
    0,
    Number(controller.state.eventCursor || 0),
    Number(readState.seenCursor || 0),
    Number(latestCursor || 0),
    Number(controller.state.pendingSeenCursor || 0),
  )
  const serverLatestAt = Math.max(0, Number(readState.latestAt || 0))
  const nextHasUnread = serverLatestAt > 0 && nextEventCursor > nextSeenCursor
  const changed = !controller.state.initialized
    || nextSeenAt !== controller.state.seenAt
    || nextSeenCursor !== controller.state.seenCursor
    || nextEventCursor !== controller.state.eventCursor
    || serverLatestAt !== controller.state.latestAt
    || nextHasUnread !== controller.state.hasUnread

  controller.state.initialized = true
  controller.state.seenAt = nextSeenAt
  controller.state.seenCursor = nextSeenCursor
  controller.state.latestAt = serverLatestAt
  controller.state.eventCursor = nextEventCursor
  controller.state.hasUnread = nextHasUnread
  if (changed) {
    persist(controller)
    notify(controller)
  }
  return true
}

function hasPendingWrite(controller) {
  return Number(controller.state.pendingSeenAt || 0) > 0
    || Number(controller.state.pendingSeenCursor || 0) > 0
}

async function flushPending(controller) {
  if (controller.flushPromise) return controller.flushPromise
  if (!hasPendingWrite(controller)) return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

  controller.flushPromise = (async () => {
    const seenAt = Math.max(0, Number(controller.state.pendingSeenAt || 0))
    const seenCursor = Math.max(0, Number(controller.state.pendingSeenCursor || 0))
    try {
      await savePreviewStudySeen(seenAt, seenCursor)
      if (Number(controller.state.pendingSeenAt || 0) <= seenAt) controller.state.pendingSeenAt = 0
      if (Number(controller.state.pendingSeenCursor || 0) <= seenCursor) controller.state.pendingSeenCursor = 0
      persist(controller)
      return !hasPendingWrite(controller)
    } catch (error) {
      console.warn('S-Hub study read-state sync unavailable:', error)
      return false
    }
  })().finally(() => {
    controller.flushPromise = null
  })
  return controller.flushPromise
}

function markControllerSeen(controller) {
  if (!controller.state.initialized || !controller.state.hasUnread) return false
  const latestAt = Math.max(0, Number(controller.state.latestAt || 0))
  const eventCursor = Math.max(0, Number(controller.state.eventCursor || 0))
  controller.state.hasUnread = false
  controller.state.seenAt = Math.max(Number(controller.state.seenAt || 0), latestAt)
  controller.state.seenCursor = Math.max(Number(controller.state.seenCursor || 0), eventCursor)
  controller.state.pendingSeenAt = Math.max(latestAt, Number(controller.state.pendingSeenAt || 0))
  controller.state.pendingSeenCursor = Math.max(
    eventCursor,
    Number(controller.state.pendingSeenCursor || 0),
  )
  persist(controller)
  notify(controller)
  void flushPending(controller)
  return true
}

function consumeDeferredSeen(controller, syncToken) {
  if (!syncToken || controller.deferredSeenSync !== syncToken) return
  controller.deferredSeenSync = null
  markControllerSeen(controller)
}

async function syncController(controller) {
  if (controller.syncPromise) return controller.syncPromise
  const syncToken = {}
  controller.syncToken = syncToken
  controller.syncPromise = (async () => {
    try {
      const flushed = await flushPending(controller)
      if (!flushed && hasPendingWrite(controller)) return

      const firstPage = await loadPreviewStudyEvents({ since: controller.state.seenCursor })
      const latestCursor = Math.max(
        Number(firstPage.latestCursor || 0),
        Number(firstPage.cursor || 0),
      )

      if (applyServerReadState(controller, firstPage.readState, latestCursor)) {
        consumeDeferredSeen(controller, syncToken)
        return
      }

      // Compatibility fallback while an older Edge Function is still serving.
      if (!controller.state.initialized) {
        controller.state.initialized = true
        controller.state.eventCursor = latestCursor
        controller.state.seenCursor = latestCursor
        controller.state.latestAt = 0
        controller.state.seenAt = 0
        controller.state.hasUnread = false
        persist(controller)
        notify(controller)
        consumeDeferredSeen(controller, syncToken)
        return
      }

      let cursor = Math.max(0, Number(controller.state.seenCursor || 0))
      let combinedLatestCursor = Math.max(controller.state.eventCursor, latestCursor)
      let latestOther = latestOtherEvent(firstPage.events, controller.identityKey)
      let page = firstPage
      let guard = 0
      while (page.hasMore && guard < 20) {
        const nextCursor = Math.max(cursor, Number(page.cursor || 0))
        if (nextCursor <= cursor) break
        cursor = nextCursor
        page = await loadPreviewStudyEvents({ since: cursor })
        const pageOther = latestOtherEvent(page.events, controller.identityKey)
        if (pageOther.cursor > latestOther.cursor) latestOther = pageOther
        else latestOther.startedAt = Math.max(latestOther.startedAt, pageOther.startedAt)
        combinedLatestCursor = Math.max(combinedLatestCursor, Number(page.latestCursor || 0), Number(page.cursor || 0))
        guard += 1
      }

      const nextEventCursor = Math.max(controller.state.eventCursor, combinedLatestCursor)
      const nextHasUnread = latestOther.cursor > Number(controller.state.seenCursor || 0)
      if (
        nextEventCursor !== controller.state.eventCursor
        || nextHasUnread !== controller.state.hasUnread
        || latestOther.startedAt !== controller.state.latestAt
      ) {
        controller.state.eventCursor = nextEventCursor
        controller.state.latestAt = latestOther.startedAt
        controller.state.hasUnread = nextHasUnread
        persist(controller)
        notify(controller)
      }
      consumeDeferredSeen(controller, syncToken)
    } catch (error) {
      console.warn('S-Hub study unread sync unavailable:', error)
    }
  })().finally(() => {
    if (controller.deferredSeenSync === syncToken) controller.deferredSeenSync = null
    if (controller.syncToken === syncToken) controller.syncToken = null
    controller.syncPromise = null
  })
  return controller.syncPromise
}

function startController(controller) {
  if (controller.started) return
  controller.started = true
  void syncController(controller)

  subscribePreviewStudyRealtime((payload) => {
    // Only a new study start creates an unread signal. Pause/resume/stop still
    // refresh the Study UI, but do not nag the class with new unread dots.
    if (String(payload?.kind || '') === 'start') void syncController(controller)
  }).then((stop) => {
    if (!controller.started) stop()
    else controller.stopRealtime = stop
  }).catch((error) => {
    console.warn('S-Hub study unread realtime unavailable:', error)
  })

  controller.onResume = () => {
    if (document.hidden || navigator.onLine === false) return
    void syncController(controller)
  }
  window.addEventListener('focus', controller.onResume)
  window.addEventListener('online', controller.onResume)
  document.addEventListener('visibilitychange', controller.onResume)
}

function stopController(controller) {
  if (!controller.started) return
  controller.started = false
  controller.stopRealtime?.()
  controller.stopRealtime = null
  if (controller.onResume) {
    window.removeEventListener('focus', controller.onResume)
    window.removeEventListener('online', controller.onResume)
    document.removeEventListener('visibilitychange', controller.onResume)
  }
  controller.onResume = null
}

function controllerFor(profile) {
  const key = identityKey(profile)
  if (!controllers.has(key)) {
    controllers.set(key, {
      identityKey: key,
      state: loadStored(key),
      listeners: new Set(),
      started: false,
      stopRealtime: null,
      onResume: null,
      syncPromise: null,
      syncToken: null,
      deferredSeenSync: null,
      flushPromise: null,
    })
  }
  return controllers.get(key)
}

export function subscribePreviewStudyUnread(profile, listener) {
  if (typeof listener !== 'function') return () => {}
  const controller = controllerFor(profile)
  controller.listeners.add(listener)
  if (controller.listeners.size === 1) startController(controller)
  listener(snapshot(controller))
  return () => {
    controller.listeners.delete(listener)
    if (!controller.listeners.size) stopController(controller)
  }
}

export function markPreviewStudySeen(profile) {
  const controller = controllerFor(profile)
  const activeSyncToken = controller.syncToken
  markControllerSeen(controller)
  if (activeSyncToken) {
    controller.deferredSeenSync = activeSyncToken
    return
  }
  if (!controller.state.initialized) {
    void syncController(controller)
    if (controller.syncToken) controller.deferredSeenSync = controller.syncToken
  }
}

export function previewStudyUnreadSnapshot(profile) {
  return snapshot(controllerFor(profile))
}
