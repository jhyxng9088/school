import { studentKeyFor } from './school-sync.js'
import { loadPreviewStudy, loadPreviewStudyEvents } from './preview-study-client.js'
import { subscribePreviewStudyRealtime } from './preview-study-realtime.js'
import { advancePreviewUnreadState, loadPreviewUnreadState } from './preview-unread-state.js'

const STORAGE_PREFIX = 'school.studyUnread.v1:'
const controllers = new Map()

function identityKey(profile) {
  return String(studentKeyFor(profile) || 'unknown').slice(0, 160)
}

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`
}

function blankState() {
  return { initialized: false, latestAt: 0, seenAt: 0, eventCursor: 0, seenCursor: 0, revision: 0 }
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
      // Old v1 caches did not store a distinct seen event cursor. Keep zero on
      // upgrade rather than pretending every locally processed event was seen.
      seenCursor: Math.max(0, Math.floor(Number(parsed?.seenCursor || 0))),
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
      seenCursor: controller.state.seenCursor,
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
    seenCursor: Math.max(0, Number(controller.state.seenCursor || 0)),
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

function mergeSharedStudySeen(controller, shared) {
  const seenAt = Math.max(0, Number(shared?.studySeenAt || 0))
  const seenCursor = Math.max(0, Math.floor(Number(shared?.studySeenCursor || 0)))
  let changed = false

  if (seenAt > Number(controller.state.seenAt || 0)) {
    controller.state.seenAt = seenAt
    changed = true
  }
  if (seenAt > Number(controller.state.latestAt || 0)) {
    controller.state.latestAt = seenAt
    changed = true
  }
  if (seenCursor > Number(controller.state.seenCursor || 0)) {
    controller.state.seenCursor = seenCursor
    changed = true
  }
  if (seenCursor > Number(controller.state.eventCursor || 0)) {
    controller.state.eventCursor = seenCursor
    changed = true
  }
  if (changed) {
    persist(controller)
    notify(controller)
  }
  return changed
}

function pushSharedStudySeen(controller, seenAt, seenCursor) {
  return advancePreviewUnreadState({
    studyInitialized: true,
    studySeenAt: Math.max(0, Number(seenAt || 0)),
    studySeenCursor: Math.max(0, Math.floor(Number(seenCursor || 0))),
  }).then((shared) => {
    mergeSharedStudySeen(controller, shared)
    return shared
  }).catch((error) => {
    console.warn('S-Hub study shared seen save unavailable:', error)
    return null
  })
}

async function hydrateSharedStudyState(controller) {
  const shared = await loadPreviewUnreadState()
  const localInitialized = controller.state.initialized
  const localSeenAt = Math.max(0, Number(controller.state.seenAt || 0))
  const localSeenCursor = Math.max(0, Math.floor(Number(controller.state.seenCursor || 0)))

  if (shared.studyInitialized) {
    let effective = shared
    if (localInitialized && (
      localSeenAt > Number(shared.studySeenAt || 0)
      || localSeenCursor > Number(shared.studySeenCursor || 0)
    )) {
      effective = await pushSharedStudySeen(controller, localSeenAt, localSeenCursor) || shared
    }

    if (!localInitialized) {
      const seenAt = Math.max(0, Number(effective.studySeenAt || 0))
      const seenCursor = Math.max(0, Math.floor(Number(effective.studySeenCursor || 0)))
      controller.state.initialized = true
      controller.state.latestAt = seenAt
      controller.state.seenAt = seenAt
      controller.state.eventCursor = seenCursor
      controller.state.seenCursor = seenCursor
      persist(controller)
      notify(controller)
    } else {
      mergeSharedStudySeen(controller, effective)
    }
    return true
  }

  if (localInitialized) {
    await pushSharedStudySeen(controller, localSeenAt, localSeenCursor)
    return true
  }
  return false
}

async function syncController(controller, { refreshShared = false } = {}) {
  if (controller.syncPromise) return controller.syncPromise
  controller.syncPromise = (async () => {
    try {
      if (refreshShared || !controller.state.initialized) {
        try {
          await hydrateSharedStudyState(controller)
        } catch (error) {
          console.warn('S-Hub study shared seen sync unavailable:', error)
        }
      }

      const [current, firstPage] = await Promise.all([
        loadPreviewStudy({ scope: 'class' }),
        loadPreviewStudyEvents({ since: controller.state.eventCursor }),
      ])
      const currentLatest = latestOtherStart(current, controller.identityKey)

      if (!controller.state.initialized) {
        // First run establishes a baseline. Existing sessions/history must not
        // suddenly appear as unread when this feature is first deployed.
        const baselineCursor = Math.max(0, Number(firstPage.latestCursor || firstPage.cursor || 0))
        controller.state.initialized = true
        controller.state.eventCursor = baselineCursor
        controller.state.seenCursor = baselineCursor
        controller.state.latestAt = currentLatest
        controller.state.seenAt = currentLatest
        persist(controller)
        notify(controller)
        void pushSharedStudySeen(controller, currentLatest, baselineCursor)
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
  void syncController(controller, { refreshShared: true })

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
    void syncController(controller, { refreshShared: true })
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
  if (!controller.state.initialized) return
  const latest = Math.max(0, Number(controller.state.latestAt || 0))
  const cursor = Math.max(0, Math.floor(Number(controller.state.eventCursor || 0)))
  const nextSeenAt = Math.max(Number(controller.state.seenAt || 0), latest)
  const nextSeenCursor = Math.max(Number(controller.state.seenCursor || 0), cursor)
  if (nextSeenAt === controller.state.seenAt && nextSeenCursor === controller.state.seenCursor) return
  controller.state.seenAt = nextSeenAt
  controller.state.seenCursor = nextSeenCursor
  persist(controller)
  notify(controller)
  void pushSharedStudySeen(controller, nextSeenAt, nextSeenCursor)
}

export function previewStudyUnreadSnapshot(profile) {
  return snapshot(controllerFor(profile))
}
