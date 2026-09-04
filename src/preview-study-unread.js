import { studentKeyFor } from './school-sync.js'
import { loadPreviewStudy, loadPreviewStudyEvents, savePreviewStudySeen } from './preview-study-client.js'
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
    latestAt: 0,
    seenAt: 0,
    eventCursor: 0,
    pendingSeenAt: 0,
    pendingSeenCursor: 0,
    revision: 0,
  }
}

function loadStored(key) {
  if (typeof localStorage === 'undefined') return blankState()
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || '{}')
    return {
      initialized: Boolean(parsed?.initialized),
      latestAt: Math.max(0, Number(parsed?.latestAt || 0)),
      seenAt: Math.max(0, Number(parsed?.seenAt || 0)),
      eventCursor: Math.max(0, Math.floor(Number(parsed?.eventCursor || 0))),
      pendingSeenAt: Math.max(0, Number(parsed?.pendingSeenAt || 0)),
      pendingSeenCursor: Math.max(0, Math.floor(Number(parsed?.pendingSeenCursor || 0))),
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
      latestAt: controller.state.latestAt,
      seenAt: controller.state.seenAt,
      eventCursor: controller.state.eventCursor,
      pendingSeenAt: controller.state.pendingSeenAt,
      pendingSeenCursor: controller.state.pendingSeenCursor,
    }))
  } catch {
    // Keep the live state even when storage is unavailable.
  }
}

function snapshot(controller) {
  const latestAt = Math.max(0, Number(controller.state.latestAt || 0))
  const seenAt = Math.max(0, Number(controller.state.seenAt || 0))
  return {
    hasUnread: controller.state.initialized && latestAt > seenAt,
    latestAt,
    seenAt,
    eventCursor: Math.max(0, Number(controller.state.eventCursor || 0)),
    revision: controller.state.revision,
  }
}

function notify(controller) {
  controller.state.revision += 1
  const next = snapshot(controller)
  for (const listener of [...controller.listeners]) listener(next)
}

function latestOtherStart(snapshotValue, myStudentKey) {
  let latest = 0
  for (const student of Array.isArray(snapshotValue?.students) ? snapshotValue.students : []) {
    if (!student?.active || String(student.studentKey || '') === myStudentKey) continue
    latest = Math.max(latest, Number(student.active.startedAt || 0))
  }
  return latest
}

function latestOtherEvent(events, myStudentKey) {
  let latest = 0
  for (const event of Array.isArray(events) ? events : []) {
    if (String(event?.studentKey || '') === myStudentKey) continue
    latest = Math.max(latest, Number(event?.startedAt || 0))
  }
  return latest
}

function applyServerReadState(controller, readState, currentLatest, eventLatest, latestCursor) {
  if (readState?.initialized !== true) return false
  const nextSeenAt = Math.max(
    0,
    Number(readState.seenAt || 0),
    Number(controller.state.pendingSeenAt || 0),
  )
  const nextLatestAt = Math.max(
    0,
    Number(readState.latestAt || 0),
    Number(currentLatest || 0),
    Number(eventLatest || 0),
  )
  const nextCursor = Math.max(
    0,
    Number(readState.seenCursor || 0),
    Number(latestCursor || 0),
    Number(controller.state.pendingSeenCursor || 0),
  )
  const changed = !controller.state.initialized
    || nextSeenAt !== controller.state.seenAt
    || nextLatestAt !== controller.state.latestAt
    || nextCursor !== controller.state.eventCursor

  controller.state.initialized = true
  controller.state.seenAt = nextSeenAt
  controller.state.latestAt = nextLatestAt
  controller.state.eventCursor = nextCursor
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

async function syncController(controller) {
  if (controller.syncPromise) return controller.syncPromise
  controller.syncPromise = (async () => {
    try {
      const flushed = await flushPending(controller)
      if (!flushed && hasPendingWrite(controller)) return

      const [current, firstPage] = await Promise.all([
        loadPreviewStudy({ scope: 'class' }),
        loadPreviewStudyEvents({ since: controller.state.eventCursor }),
      ])
      const currentLatest = latestOtherStart(current, controller.identityKey)
      const eventLatest = latestOtherEvent(firstPage.events, controller.identityKey)
      const latestCursor = Math.max(
        Number(firstPage.latestCursor || 0),
        Number(firstPage.cursor || 0),
      )

      if (applyServerReadState(controller, firstPage.readState, currentLatest, eventLatest, latestCursor)) return

      // Compatibility fallback while an older Edge Function is still serving.
      if (!controller.state.initialized) {
        controller.state.initialized = true
        controller.state.eventCursor = latestCursor
        controller.state.latestAt = currentLatest
        controller.state.seenAt = currentLatest
        persist(controller)
        notify(controller)
        return
      }

      let cursor = controller.state.eventCursor
      let combinedEventLatest = eventLatest
      let combinedLatestCursor = Math.max(cursor, latestCursor)
      let page = firstPage
      let guard = 0
      while (page.hasMore && guard < 20) {
        const nextCursor = Math.max(cursor, Number(page.cursor || 0))
        if (nextCursor <= cursor) break
        cursor = nextCursor
        page = await loadPreviewStudyEvents({ since: cursor })
        combinedEventLatest = Math.max(combinedEventLatest, latestOtherEvent(page.events, controller.identityKey))
        combinedLatestCursor = Math.max(combinedLatestCursor, Number(page.latestCursor || 0), Number(page.cursor || 0))
        guard += 1
      }

      const nextLatestAt = Math.max(controller.state.latestAt, currentLatest, combinedEventLatest)
      const nextCursor = Math.max(controller.state.eventCursor, combinedLatestCursor)
      if (nextLatestAt !== controller.state.latestAt || nextCursor !== controller.state.eventCursor) {
        controller.state.latestAt = nextLatestAt
        controller.state.eventCursor = nextCursor
        persist(controller)
        notify(controller)
      }
    } catch (error) {
      console.warn('S-Hub study unread sync unavailable:', error)
    }
  })().finally(() => {
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
  const latest = Math.max(0, Number(controller.state.latestAt || 0))
  if (!controller.state.initialized || latest <= controller.state.seenAt) return
  controller.state.seenAt = latest
  controller.state.pendingSeenAt = Math.max(latest, Number(controller.state.pendingSeenAt || 0))
  controller.state.pendingSeenCursor = Math.max(
    Number(controller.state.eventCursor || 0),
    Number(controller.state.pendingSeenCursor || 0),
  )
  persist(controller)
  notify(controller)
  void flushPending(controller)
}

export function previewStudyUnreadSnapshot(profile) {
  return snapshot(controllerFor(profile))
}
