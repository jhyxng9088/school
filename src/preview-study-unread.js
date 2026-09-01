import { studentKeyFor } from './school-sync.js'
import { loadPreviewStudy, loadPreviewStudyEvents } from './preview-study-client.js'
import { subscribePreviewStudyRealtime } from './preview-study-realtime.js'

const STORAGE_PREFIX = 'school.studyUnread.v1:'
const controllers = new Map()

function identityKey(profile) {
  return String(studentKeyFor(profile) || 'unknown').slice(0, 160)
}

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`
}

function blankState() {
  return { initialized: false, latestAt: 0, seenAt: 0, eventCursor: 0, revision: 0 }
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

async function loadEventCatchup(startCursor) {
  let cursor = Math.max(0, Math.floor(Number(startCursor || 0)))
  let latestCursor = cursor
  let latestOtherAt = 0
  let guard = 0
  do {
    const page = await loadPreviewStudyEvents({ since: cursor })
    latestOtherAt = Math.max(latestOtherAt, latestOtherEvent(page.events, ''))
    const nextCursor = Math.max(cursor, Number(page.cursor || 0))
    latestCursor = Math.max(latestCursor, Number(page.latestCursor || 0), nextCursor)
    if (!page.hasMore || nextCursor <= cursor) return { cursor: latestCursor, latestOtherAt, events: page.events }
    cursor = nextCursor
    guard += 1
  } while (guard < 20)
  return { cursor: latestCursor, latestOtherAt, events: [] }
}

async function syncController(controller) {
  if (controller.syncPromise) return controller.syncPromise
  controller.syncPromise = (async () => {
    try {
      const [current, firstPage] = await Promise.all([
        loadPreviewStudy({ scope: 'class' }),
        loadPreviewStudyEvents({ since: controller.state.eventCursor }),
      ])
      const currentLatest = latestOtherStart(current, controller.identityKey)

      if (!controller.state.initialized) {
        // First run establishes a baseline. Existing sessions/history must not
        // suddenly appear as unread when this feature is first deployed.
        controller.state.initialized = true
        controller.state.eventCursor = Math.max(0, Number(firstPage.latestCursor || firstPage.cursor || 0))
        controller.state.latestAt = currentLatest
        controller.state.seenAt = currentLatest
        persist(controller)
        notify(controller)
        return
      }

      let cursor = controller.state.eventCursor
      let eventLatest = latestOtherEvent(firstPage.events, controller.identityKey)
      let latestCursor = Math.max(cursor, Number(firstPage.latestCursor || 0), Number(firstPage.cursor || 0))
      let page = firstPage
      let guard = 0
      while (page.hasMore && guard < 20) {
        const nextCursor = Math.max(cursor, Number(page.cursor || 0))
        if (nextCursor <= cursor) break
        cursor = nextCursor
        page = await loadPreviewStudyEvents({ since: cursor })
        eventLatest = Math.max(eventLatest, latestOtherEvent(page.events, controller.identityKey))
        latestCursor = Math.max(latestCursor, Number(page.latestCursor || 0), Number(page.cursor || 0))
        guard += 1
      }

      const nextLatestAt = Math.max(controller.state.latestAt, currentLatest, eventLatest)
      const nextCursor = Math.max(controller.state.eventCursor, latestCursor)
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
  persist(controller)
  notify(controller)
}

export function previewStudyUnreadSnapshot(profile) {
  return snapshot(controllerFor(profile))
}
