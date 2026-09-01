import { useCallback, useEffect, useMemo, useState } from 'react'
import { studentKeyFor } from './school-sync.js'
import { loadPreviewBoardEvents, subscribePreviewBoardRealtime } from './preview-board-realtime.js'
import './preview-board-unread.css'

const STORAGE_PREFIX = 'school.boardUnread.v2:'
const MAX_UNREAD_POSTS = 120
const controllers = new Map()

function safeIdentityKey(profile) {
  return String(studentKeyFor(profile) || 'unknown').slice(0, 160)
}

function storageKey(identityKey) {
  return `${STORAGE_PREFIX}${identityKey}`
}

function blankState() {
  return { cursor: 0, seenCursor: 0, initialized: false, unread: {}, revision: 0 }
}

function loadStored(identityKey) {
  if (typeof localStorage === 'undefined') return blankState()
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(identityKey)) || '{}')
    const unread = parsed?.unread && typeof parsed.unread === 'object' ? parsed.unread : {}
    const cursor = Math.max(0, Number(parsed?.cursor || 0))
    const initialized = Boolean(parsed?.initialized)
    return {
      cursor,
      // Older v2 state did not distinguish opening the board from opening each post.
      // Treat an upgraded install as already having visited its current board cursor.
      seenCursor: Math.max(0, Number(parsed?.seenCursor ?? (initialized ? cursor : 0))),
      initialized,
      unread,
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
      cursor: controller.state.cursor,
      seenCursor: controller.state.seenCursor,
      initialized: controller.state.initialized,
      unread: controller.state.unread,
    }))
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function snapshot(controller) {
  const unreadByPost = { ...controller.state.unread }
  const unreadPostIds = Object.keys(unreadByPost)
  const seenCursor = Math.max(0, Number(controller.state.seenCursor || 0))
  const sectionUnreadCount = Object.values(unreadByPost)
    .filter((entry) => Number(entry?.id || 0) > seenCursor)
    .length
  return {
    hasUnread: unreadPostIds.length > 0,
    unreadCount: unreadPostIds.length,
    hasSectionUnread: sectionUnreadCount > 0,
    sectionUnreadCount,
    cursor: Math.max(0, Number(controller.state.cursor || 0)),
    seenCursor,
    unreadByPost,
    revision: controller.state.revision,
  }
}

function notify(controller) {
  controller.state.revision += 1
  const next = snapshot(controller)
  for (const listener of [...controller.listeners]) listener(next)
}

function trimUnread(unread) {
  const entries = Object.entries(unread)
    .sort((a, b) => Number(b[1]?.id || b[1]?.at || 0) - Number(a[1]?.id || a[1]?.at || 0))
    .slice(0, MAX_UNREAD_POSTS)
  return Object.fromEntries(entries)
}

function applyEvents(controller, events, cursor) {
  const nextUnread = { ...controller.state.unread }
  let changed = false
  for (const event of Array.isArray(events) ? events : []) {
    const id = Math.max(0, Number(event?.id || 0))
    const postId = String(event?.postId || '').trim()
    const sectionId = String(event?.sectionId || 'general').trim().slice(0, 32) || 'general'
    const kind = String(event?.kind || 'post_updated').trim().slice(0, 24)
    const at = Math.max(0, Number(event?.at || 0))
    if (!id || !postId) continue
    const current = nextUnread[postId]
    if (!current || id >= Number(current.id || 0)) {
      nextUnread[postId] = { id, postId, sectionId, kind, at }
      changed = true
    }
  }

  const nextCursor = Math.max(controller.state.cursor, Number(cursor || 0))
  if (nextCursor !== controller.state.cursor || !controller.state.initialized) changed = true
  controller.state.cursor = nextCursor
  controller.state.initialized = true
  if (changed) {
    controller.state.unread = trimUnread(nextUnread)
    persist(controller)
    notify(controller)
  }
}

async function syncController(controller) {
  if (controller.syncPromise) return controller.syncPromise
  controller.syncPromise = (async () => {
    try {
      if (!controller.state.initialized) {
        const baseline = await loadPreviewBoardEvents(null)
        const cursor = Math.max(0, Number(baseline.cursor || 0))
        controller.state.cursor = cursor
        controller.state.seenCursor = cursor
        controller.state.initialized = true
        persist(controller)
        notify(controller)
        return
      }

      let cursor = controller.state.cursor
      for (let page = 0; page < 4; page += 1) {
        const result = await loadPreviewBoardEvents(cursor)
        applyEvents(controller, result.events, result.cursor)
        cursor = controller.state.cursor
        if (!result.hasMore) break
      }
    } catch (error) {
      console.warn('S-Hub board unread sync unavailable:', error)
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

  subscribePreviewBoardRealtime(() => {
    void syncController(controller)
  }).then((stop) => {
    if (!controller.started) stop()
    else controller.stopRealtime = stop
  }).catch((error) => {
    console.warn('S-Hub board unread realtime unavailable:', error)
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

function controllerFor(identityKey) {
  if (!controllers.has(identityKey)) {
    controllers.set(identityKey, {
      identityKey,
      state: loadStored(identityKey),
      listeners: new Set(),
      started: false,
      stopRealtime: null,
      onResume: null,
      syncPromise: null,
    })
  }
  return controllers.get(identityKey)
}

function subscribeController(controller, listener) {
  controller.listeners.add(listener)
  if (controller.listeners.size === 1) startController(controller)
  listener(snapshot(controller))
  return () => {
    controller.listeners.delete(listener)
    if (!controller.listeners.size) stopController(controller)
  }
}

function markPostReadFor(controller, postId) {
  const id = String(postId || '').trim()
  if (!id || !controller.state.unread[id]) return
  const next = { ...controller.state.unread }
  delete next[id]
  controller.state.unread = next
  persist(controller)
  notify(controller)
}

function markSectionSeenFor(controller) {
  const cursor = Math.max(0, Number(controller.state.cursor || 0))
  if (!controller.state.initialized || cursor <= Number(controller.state.seenCursor || 0)) return
  controller.state.seenCursor = cursor
  persist(controller)
  notify(controller)
}

export function subscribePreviewBoardUnread(profile, listener) {
  if (typeof listener !== 'function') return () => {}
  return subscribeController(controllerFor(safeIdentityKey(profile)), listener)
}

export function markPreviewBoardSectionSeen(profile) {
  markSectionSeenFor(controllerFor(safeIdentityKey(profile)))
}

export function previewBoardUnreadSnapshot(profile) {
  return snapshot(controllerFor(safeIdentityKey(profile)))
}

export function usePreviewBoardUnread(profile) {
  const identityKey = useMemo(() => safeIdentityKey(profile), [profile])
  const controller = useMemo(() => controllerFor(identityKey), [identityKey])
  const [state, setState] = useState(() => snapshot(controller))

  useEffect(() => subscribeController(controller, setState), [controller])

  const markPostRead = useCallback((postId) => markPostReadFor(controller, postId), [controller])
  const markSectionSeen = useCallback(() => markSectionSeenFor(controller), [controller])
  const isPostUnread = useCallback((postId) => Boolean(state.unreadByPost[String(postId || '')]), [state.unreadByPost])
  const unreadKind = useCallback((postId) => String(state.unreadByPost[String(postId || '')]?.kind || ''), [state.unreadByPost])

  return {
    ...state,
    markPostRead,
    markSectionSeen,
    isPostUnread,
    unreadKind,
    sync: () => syncController(controller),
  }
}
