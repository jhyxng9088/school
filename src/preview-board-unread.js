import { useCallback, useEffect, useMemo, useState } from 'react'
import { studentKeyFor } from './school-sync.js'
import {
  loadPreviewBoardEvents,
  savePreviewBoardPostRead,
  savePreviewBoardSectionSeen,
  subscribePreviewBoardRealtime,
} from './preview-board-realtime.js'
import './preview-board-unread.css'

const STORAGE_PREFIX = 'school.boardUnread.v3:'
const MAX_UNREAD_POSTS = 120
const controllers = new Map()

function safeIdentityKey(profile) {
  return String(studentKeyFor(profile) || 'unknown').slice(0, 160)
}

function storageKey(identityKey) {
  return `${STORAGE_PREFIX}${identityKey}`
}

function blankState() {
  return {
    cursor: 0,
    seenCursor: 0,
    initialized: false,
    unread: {},
    pendingReads: {},
    pendingSeenCursor: 0,
    revision: 0,
  }
}

function normalizePendingReads(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value)
    .map(([postId, cursor]) => [String(postId || '').trim(), Math.max(0, Math.floor(Number(cursor || 0)))])
    .filter(([postId, cursor]) => postId && cursor > 0)
    .slice(0, MAX_UNREAD_POSTS)
  return Object.fromEntries(entries)
}

function loadStored(identityKey) {
  if (typeof localStorage === 'undefined') return blankState()
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(identityKey)) || '{}')
    const unread = parsed?.unread && typeof parsed.unread === 'object' && !Array.isArray(parsed.unread)
      ? parsed.unread
      : {}
    const cursor = Math.max(0, Number(parsed?.cursor || 0))
    const initialized = Boolean(parsed?.initialized)
    return {
      cursor,
      seenCursor: Math.max(0, Number(parsed?.seenCursor ?? (initialized ? cursor : 0))),
      initialized,
      unread,
      pendingReads: normalizePendingReads(parsed?.pendingReads),
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
      cursor: controller.state.cursor,
      seenCursor: controller.state.seenCursor,
      initialized: controller.state.initialized,
      unread: controller.state.unread,
      pendingReads: controller.state.pendingReads,
      pendingSeenCursor: controller.state.pendingSeenCursor,
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

function unreadMapFromServer(readState, pendingReads = {}) {
  const unread = {}
  for (const entry of Array.isArray(readState?.unread) ? readState.unread : []) {
    const id = Math.max(0, Number(entry?.id || 0))
    const postId = String(entry?.postId || '').trim()
    const sectionId = String(entry?.sectionId || 'general').trim().slice(0, 32) || 'general'
    const kind = String(entry?.kind || 'post_updated').trim().slice(0, 24)
    const at = Math.max(0, Number(entry?.at || 0))
    if (!id || !postId || Number(pendingReads[postId] || 0) >= id) continue
    unread[postId] = { id, postId, sectionId, kind, at }
  }
  return trimUnread(unread)
}

function applyServerReadState(controller, readState) {
  if (readState?.initialized !== true) return false
  const nextCursor = Math.max(0, Number(readState.cursor || 0))
  const nextSeenCursor = Math.max(
    0,
    Number(readState.seenCursor || 0),
    Number(controller.state.pendingSeenCursor || 0),
  )
  const nextUnread = unreadMapFromServer(readState, controller.state.pendingReads)
  const before = JSON.stringify({
    cursor: controller.state.cursor,
    seenCursor: controller.state.seenCursor,
    initialized: controller.state.initialized,
    unread: controller.state.unread,
  })
  const after = JSON.stringify({
    cursor: nextCursor,
    seenCursor: nextSeenCursor,
    initialized: true,
    unread: nextUnread,
  })

  controller.state.cursor = nextCursor
  controller.state.seenCursor = nextSeenCursor
  controller.state.initialized = true
  controller.state.unread = nextUnread
  if (before === after) return true
  persist(controller)
  notify(controller)
  return true
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
    if (!id || !postId || Number(controller.state.pendingReads[postId] || 0) >= id) continue
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

function hasPendingWrites(controller) {
  return Object.keys(controller.state.pendingReads).length > 0
    || Number(controller.state.pendingSeenCursor || 0) > 0
}

async function flushPending(controller) {
  if (controller.flushPromise) return controller.flushPromise
  if (!hasPendingWrites(controller)) return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

  controller.flushPromise = (async () => {
    try {
      for (const [postId, readCursor] of Object.entries({ ...controller.state.pendingReads })) {
        await savePreviewBoardPostRead(postId, readCursor)
        if (Number(controller.state.pendingReads[postId] || 0) <= Number(readCursor || 0)) {
          const nextPending = { ...controller.state.pendingReads }
          delete nextPending[postId]
          controller.state.pendingReads = nextPending
          persist(controller)
        }
      }

      const pendingSeenCursor = Math.max(0, Number(controller.state.pendingSeenCursor || 0))
      if (pendingSeenCursor > 0) {
        await savePreviewBoardSectionSeen(pendingSeenCursor)
        if (Number(controller.state.pendingSeenCursor || 0) <= pendingSeenCursor) {
          controller.state.pendingSeenCursor = 0
          persist(controller)
        }
      }
      return !hasPendingWrites(controller)
    } catch (error) {
      console.warn('S-Hub board read-state sync unavailable:', error)
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
      if (!flushed && hasPendingWrites(controller)) return

      const result = await loadPreviewBoardEvents(controller.state.initialized ? controller.state.cursor : null)
      if (applyServerReadState(controller, result.readState)) return

      // Compatibility fallback while an older Edge Function is still serving.
      if (!controller.state.initialized) {
        const cursor = Math.max(0, Number(result.cursor || 0))
        controller.state.cursor = cursor
        controller.state.seenCursor = cursor
        controller.state.initialized = true
        persist(controller)
        notify(controller)
        return
      }

      applyEvents(controller, result.events, result.cursor)
      let cursor = controller.state.cursor
      let pageResult = result
      for (let page = 1; page < 4 && pageResult.hasMore; page += 1) {
        pageResult = await loadPreviewBoardEvents(cursor)
        if (applyServerReadState(controller, pageResult.readState)) return
        applyEvents(controller, pageResult.events, pageResult.cursor)
        cursor = controller.state.cursor
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
      flushPromise: null,
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
  const entry = controller.state.unread[id]
  const readCursor = Math.max(0, Number(entry?.id || 0))
  if (!id || !entry || !readCursor) return
  const next = { ...controller.state.unread }
  delete next[id]
  controller.state.unread = next
  controller.state.pendingReads = {
    ...controller.state.pendingReads,
    [id]: Math.max(readCursor, Number(controller.state.pendingReads[id] || 0)),
  }
  persist(controller)
  notify(controller)
  void flushPending(controller)
}

function markSectionSeenFor(controller) {
  const cursor = Math.max(0, Number(controller.state.cursor || 0))
  if (!controller.state.initialized || cursor <= Number(controller.state.seenCursor || 0)) return
  controller.state.seenCursor = cursor
  controller.state.pendingSeenCursor = Math.max(cursor, Number(controller.state.pendingSeenCursor || 0))
  persist(controller)
  notify(controller)
  void flushPending(controller)
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
