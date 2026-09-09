import { getApp } from 'firebase/app'
import { doc, getFirestore, setDoc } from 'firebase/firestore'
import { classKeyFor, ensureSignedIn, studentKeyFor } from './school-sync.js'
import { subscribeClassLiveData } from './class-live-data.js'
import { reminderActivityEligibleForStudent, reminderExpiryMs } from './reminder-lifecycle.js'
import { markPreviewBoardSectionSeen, subscribePreviewBoardUnread } from './preview-board-unread.js'
import { markPreviewStudySeen, subscribePreviewStudyUnread } from './preview-study-unread.js'

const INTERNAL_PREFIX = '__school_seen_'
const READ_CACHE_PREFIX = 'school.unreadState.v3:'
const NAV_STATE_IDS = {
  todo: `${INTERNAL_PREFIX}nav_todo`,
  timetable: `${INTERNAL_PREFIX}nav_timetable`,
  academic: `${INTERNAL_PREFIX}nav_academic`,
  meal: `${INTERNAL_PREFIX}nav_meal`,
}
const REMINDER_ROW_BASELINE_ID = `${INTERNAL_PREFIX}reminder_rows_v3`
const ACADEMIC_BASELINE_ID = `${INTERNAL_PREFIX}academic_v2`
const MEAL_CACHE_KEY = 'school.stage3.meals.v1'
const stores = new Map()

function safeReminderStateId(todoId) {
  const safe = String(todoId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
  return `${INTERNAL_PREFIX}summary_v2_${safe}`
}

function todayRawDate() {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

function todayDateKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function todayVersion() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function hasTodayMealInCache() {
  try {
    const store = JSON.parse(localStorage.getItem(MEAL_CACHE_KEY) || 'null')
    const ranges = store?.ranges && typeof store.ranges === 'object' ? store.ranges : {}
    const key = todayRawDate()
    return Object.values(ranges).some((entry) => (
      Array.isArray(entry?.meals) && entry.meals.some((meal) => String(meal?.rawDate || '') === key)
    ))
  } catch {
    return false
  }
}

function normalizeVersionMap(value) {
  const next = new Map()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next
  Object.entries(value).forEach(([id, version]) => {
    const cleanId = String(id || '')
    const cleanVersion = Math.max(0, Number(version || 0))
    if (!cleanId.startsWith(INTERNAL_PREFIX) || cleanVersion <= 0) return
    next.set(cleanId, cleanVersion)
  })
  return next
}

function loadReadCache(studentKey) {
  if (typeof localStorage === 'undefined') {
    return { initialized: false, seen: new Map(), pendingWrites: new Map() }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(`${READ_CACHE_PREFIX}${studentKey}`) || '{}')
    const seenVersions = normalizeVersionMap(parsed?.seen)
    const pendingWrites = normalizeVersionMap(parsed?.pendingWrites)
    pendingWrites.forEach((version, id) => {
      if (version > Number(seenVersions.get(id) || 0)) seenVersions.set(id, version)
    })
    const seen = new Map([...seenVersions].map(([id, version]) => [id, { updatedAt: version }]))
    return { initialized: parsed?.initialized === true, seen, pendingWrites }
  } catch {
    return { initialized: false, seen: new Map(), pendingWrites: new Map() }
  }
}

function persistReadCache(store) {
  if (typeof localStorage === 'undefined') return
  try {
    const seen = {}
    store.state.seen.forEach((value, id) => {
      const version = Math.max(0, Number(value?.updatedAt || 0))
      if (id.startsWith(INTERNAL_PREFIX) && version > 0) seen[id] = version
    })
    const pendingWrites = {}
    store.pendingWrites.forEach((version, id) => {
      const cleanVersion = Math.max(0, Number(version || 0))
      if (id.startsWith(INTERNAL_PREFIX) && cleanVersion > 0) pendingWrites[id] = cleanVersion
    })
    localStorage.setItem(`${READ_CACHE_PREFIX}${store.studentKey}`, JSON.stringify({
      initialized: store.state.seenReady,
      seen,
      pendingWrites,
    }))
  } catch {
    // The live/server state remains usable when local storage is unavailable.
  }
}

function createStore(profile) {
  const studentKey = studentKeyFor(profile)
  const cached = loadReadCache(studentKey)
  return {
    profile,
    classId: classKeyFor(profile),
    studentKey,
    db: null,
    state: {
      activity: new Map(),
      todos: new Map(),
      academic: new Map(),
      seen: cached.seen,
      todoState: new Map(),
      timetableOverrides: {},
      reminderTimetable: null,
      activityReady: false,
      seenReady: cached.initialized,
      todosReady: false,
      timetableReady: false,
      academicReady: false,
      mealAvailable: hasTodayMealInCache(),
      boardUnread: false,
      boardCursor: 0,
      studyUnread: false,
      studyLatestAt: 0,
      studyEventCursor: 0,
    },
    pendingWrites: cached.pendingWrites,
    listeners: new Set(),
    subscriptions: [],
    revision: 0,
    started: false,
    connected: false,
    connectPromise: null,
    flushPromise: null,
    retryTimer: 0,
    mealTimer: 0,
    reminderExpiryTimer: 0,
    onResume: null,
  }
}

function storeFor(profile) {
  const key = String(studentKeyFor(profile) || '')
  if (!key) return null
  if (!stores.has(key)) stores.set(key, createStore(profile))
  return stores.get(key)
}

function seenVersion(store, id) {
  return Number(store.state.seen.get(id)?.updatedAt || 0)
}

function timetableActivityStillRelevant(store, activity) {
  if (!activity || activity.entityType !== 'timetable') return true
  const match = /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(String(activity.entityId || ''))
  if (!match) return true
  const [, date, period] = match
  if (date < todayDateKey()) return false
  return Boolean(String(store.state.timetableOverrides?.[date]?.[String(Number(period))] || '').trim())
}

function otherActivityVersion(store, entityType) {
  let latest = 0
  store.state.activity.forEach((value) => {
    if (value.entityType !== entityType) return
    if (value.actorStudentKey && value.actorStudentKey === store.studentKey) return
    if (entityType === 'timetable' && !timetableActivityStillRelevant(store, value)) return
    latest = Math.max(latest, Number(value.updatedAt || 0))
  })
  return latest
}

function academicEventStillRelevant(value) {
  const endDate = String(value?.endDate || value?.startDate || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= todayDateKey()
}

function academicVersion(store) {
  let latest = 0
  store.state.academic.forEach((value) => {
    if (!academicEventStillRelevant(value)) return
    if (value.lastEditedByStudentKey && value.lastEditedByStudentKey === store.studentKey) return
    latest = Math.max(latest, Number(value.updatedAt || value.createdAt || 0))
  })
  return latest
}

function reminderActivity(store, todo) {
  if (!todo?.id) return null
  const personalState = store.state.todoState.get(String(todo.id)) || null
  if (!reminderActivityEligibleForStudent(todo, personalState, Date.now(), store.state.reminderTimetable)) return null
  const activity = store.state.activity.get(`reminder:${todo.id}`)
  if (!activity || !['added', 'edited'].includes(activity.action)) return null
  if (activity.actorStudentKey && activity.actorStudentKey === store.studentKey) return null
  const updatedAt = Number(activity.updatedAt || 0)
  return updatedAt > 0 ? { ...activity, updatedAt } : null
}

function reminderActivityVersion(store, todo) {
  return Number(reminderActivity(store, todo)?.updatedAt || 0)
}

function latestReminderActivityVersion(store) {
  let latest = 0
  store.state.todos.forEach((todo) => {
    latest = Math.max(latest, reminderActivityVersion(store, todo))
  })
  return latest
}

function reminderRowUnread(store, todo) {
  if (!store.state.activityReady || !store.state.seenReady || !store.state.todosReady || !todo) return false
  const baseline = seenVersion(store, REMINDER_ROW_BASELINE_ID)
  if (baseline <= 0) return false
  const version = reminderActivityVersion(store, todo)
  return version > 0 && version > Math.max(baseline, seenVersion(store, safeReminderStateId(todo.id)))
}

function hasUnreadReminderRow(store) {
  for (const todo of store.state.todos.values()) {
    if (reminderRowUnread(store, todo)) return true
  }
  return false
}

function leafUnread(store, tab) {
  if (tab === 'todo') {
    if (!store.state.activityReady || !store.state.seenReady || !store.state.todosReady) return false
    const baseline = seenVersion(store, REMINDER_ROW_BASELINE_ID)
    return latestReminderActivityVersion(store) > Math.max(seenVersion(store, NAV_STATE_IDS.todo), baseline)
      || hasUnreadReminderRow(store)
  }
  if (tab === 'timetable') {
    if (!store.state.activityReady || !store.state.seenReady || !store.state.timetableReady) return false
    return otherActivityVersion(store, 'timetable') > seenVersion(store, NAV_STATE_IDS.timetable)
  }
  if (tab === 'academic') {
    if (!store.state.seenReady || !store.state.academicReady) return false
    return academicVersion(store) > Math.max(seenVersion(store, NAV_STATE_IDS.academic), seenVersion(store, ACADEMIC_BASELINE_ID))
  }
  if (tab === 'meal') {
    return store.state.seenReady && store.state.mealAvailable && todayVersion() > seenVersion(store, NAV_STATE_IDS.meal)
  }
  if (tab === 'board') return store.state.boardUnread
  if (tab === 'study') return store.state.studyUnread
  return false
}

function navUnread(store, tab) {
  if (tab === 'class') return leafUnread(store, 'timetable') || leafUnread(store, 'board')
  if (tab === 'schedule') return leafUnread(store, 'todo') || leafUnread(store, 'academic') || leafUnread(store, 'meal')
  return leafUnread(store, tab)
}

function seenTarget(store, tab) {
  if (tab === 'todo') return latestReminderActivityVersion(store)
  if (tab === 'timetable') return otherActivityVersion(store, 'timetable')
  if (tab === 'academic') return academicVersion(store)
  if (tab === 'meal') return store.state.mealAvailable ? todayVersion() : 0
  if (tab === 'board') return Math.max(0, Number(store.state.boardCursor || 0))
  if (tab === 'study') {
    return {
      seenAt: Math.max(0, Number(store.state.studyLatestAt || 0)),
      seenCursor: Math.max(0, Number(store.state.studyEventCursor || 0)),
    }
  }
  return 0
}

function snapshot(store) {
  if (!store) return { revision: 0, unread: {}, targets: {}, reminderUnreadIds: [] }
  const unread = {
    todo: navUnread(store, 'todo'),
    timetable: navUnread(store, 'timetable'),
    academic: navUnread(store, 'academic'),
    meal: navUnread(store, 'meal'),
    board: navUnread(store, 'board'),
    study: navUnread(store, 'study'),
    class: navUnread(store, 'class'),
    schedule: navUnread(store, 'schedule'),
  }
  const reminderUnreadIds = []
  store.state.todos.forEach((todo, id) => {
    if (reminderRowUnread(store, todo)) reminderUnreadIds.push(String(id))
  })
  return {
    revision: store.revision,
    unread,
    targets: {
      todo: seenTarget(store, 'todo'),
      timetable: seenTarget(store, 'timetable'),
      academic: seenTarget(store, 'academic'),
      meal: seenTarget(store, 'meal'),
      board: seenTarget(store, 'board'),
      study: seenTarget(store, 'study'),
    },
    reminderUnreadIds,
  }
}

function notify(store) {
  store.revision += 1
  const next = snapshot(store)
  for (const listener of [...store.listeners]) {
    try { listener(next) } catch (error) { console.error('Unread store listener failed:', error) }
  }
}

function setSeenLocal(store, id, version) {
  const nextVersion = Math.max(0, Number(version || 0))
  if (!id || nextVersion <= 0 || seenVersion(store, id) >= nextVersion) return false
  store.state.seen.set(id, { updatedAt: nextVersion })
  store.pendingWrites.set(id, Math.max(nextVersion, Number(store.pendingWrites.get(id) || 0)))
  persistReadCache(store)
  return true
}

async function flushPendingWrites(store) {
  if (!store?.db || !store.state.seenReady || !store.pendingWrites.size) return true
  if (store.flushPromise) return store.flushPromise
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

  store.flushPromise = (async () => {
    for (const [id, queuedVersion] of [...store.pendingWrites.entries()]) {
      const version = Math.max(0, Number(queuedVersion || 0))
      if (!version) {
        store.pendingWrites.delete(id)
        continue
      }
      try {
        await setDoc(doc(store.db, 'students', store.studentKey, 'todoState', id), {
          completed: false,
          hidden: false,
          updatedAt: version,
        }, { merge: true })
        if (Number(store.pendingWrites.get(id) || 0) <= version) store.pendingWrites.delete(id)
        persistReadCache(store)
      } catch (error) {
        console.warn('Unread read-state sync unavailable; queued for retry:', error)
        persistReadCache(store)
        return false
      }
    }
    return !store.pendingWrites.size
  })().finally(() => {
    store.flushPromise = null
  })
  return store.flushPromise
}

function ensureBaselines(store) {
  let changed = false
  if (store.state.activityReady && store.state.seenReady && store.state.todosReady && seenVersion(store, REMINDER_ROW_BASELINE_ID) <= 0) {
    changed = setSeenLocal(store, REMINDER_ROW_BASELINE_ID, Math.max(1, latestReminderActivityVersion(store))) || changed
  }
  if (store.state.activityReady && store.state.seenReady && store.state.timetableReady && seenVersion(store, NAV_STATE_IDS.timetable) <= 0) {
    changed = setSeenLocal(store, NAV_STATE_IDS.timetable, Math.max(1, otherActivityVersion(store, 'timetable'))) || changed
  }
  if (store.state.seenReady && store.state.academicReady && seenVersion(store, ACADEMIC_BASELINE_ID) <= 0) {
    changed = setSeenLocal(store, ACADEMIC_BASELINE_ID, Math.max(1, academicVersion(store))) || changed
  }
  if (changed) void flushPendingWrites(store)
}

function scheduleNextReminderExpiry(store) {
  if (store.reminderExpiryTimer) {
    window.clearTimeout(store.reminderExpiryTimer)
    store.reminderExpiryTimer = 0
  }
  const nowMs = Date.now()
  const nextExpiry = [...store.state.todos.values()]
    .map((todo) => reminderExpiryMs(todo, store.state.reminderTimetable))
    .filter((value) => Number.isFinite(value) && value > nowMs)
    .sort((a, b) => a - b)[0]
  if (!nextExpiry || !store.started) return
  const delay = Math.max(20, Math.min(nextExpiry - nowMs + 20, 2_147_000_000))
  store.reminderExpiryTimer = window.setTimeout(() => {
    store.reminderExpiryTimer = 0
    if (store.started) publish(store)
  }, delay)
}

function publish(store) {
  ensureBaselines(store)
  notify(store)
  scheduleNextReminderExpiry(store)
}

function installSubscriptions(store) {
  store.subscriptions.push(subscribePreviewBoardUnread(store.profile, (next) => {
    const unread = Boolean(next?.hasSectionUnread)
    const cursor = Math.max(0, Number(next?.cursor || 0))
    if (unread === store.state.boardUnread && cursor === store.state.boardCursor) return
    store.state.boardUnread = unread
    store.state.boardCursor = cursor
    publish(store)
  }))

  store.subscriptions.push(subscribePreviewStudyUnread(store.profile, (next) => {
    const unread = Boolean(next?.hasUnread)
    const latestAt = Math.max(0, Number(next?.latestAt || 0))
    const eventCursor = Math.max(0, Number(next?.eventCursor || 0))
    if (unread === store.state.studyUnread && latestAt === store.state.studyLatestAt && eventCursor === store.state.studyEventCursor) return
    store.state.studyUnread = unread
    store.state.studyLatestAt = latestAt
    store.state.studyEventCursor = eventCursor
    publish(store)
  }))

  store.subscriptions.push(subscribeClassLiveData('activity', store.classId, (activity) => {
    const next = new Map()
    Object.values(activity || {}).forEach((value) => {
      if (!value?.entityType || !value?.entityId) return
      next.set(`${value.entityType}:${value.entityId}`, {
        entityType: String(value.entityType),
        entityId: String(value.entityId),
        actorStudentKey: String(value.actorStudentKey || ''),
        action: value.action === 'added' ? 'added' : 'edited',
        updatedAt: Number(value.updatedAt || 0),
      })
    })
    store.state.activity = next
    store.state.activityReady = true
    publish(store)
  }))

  store.subscriptions.push(subscribeClassLiveData('timetable', store.classId, (timetable) => {
    store.state.reminderTimetable = timetable
    const rawOverrides = timetable?.overrides
    const nextOverrides = {}
    const today = todayDateKey()
    if (rawOverrides && typeof rawOverrides === 'object') {
      Object.entries(rawOverrides).forEach(([date, periods]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || !periods || typeof periods !== 'object') return
        const nextPeriods = {}
        Object.entries(periods).forEach(([period, subject]) => {
          const number = Number(period)
          const cleanSubject = String(subject || '').trim()
          if (!Number.isInteger(number) || number < 1 || number > 7 || !cleanSubject) return
          nextPeriods[String(number)] = cleanSubject
        })
        if (Object.keys(nextPeriods).length) nextOverrides[date] = nextPeriods
      })
    }
    store.state.timetableOverrides = nextOverrides
    store.state.timetableReady = true
    publish(store)
  }))

  store.subscriptions.push(subscribeClassLiveData('todos', store.classId, (todos) => {
    const next = new Map()
    ;(Array.isArray(todos) ? todos : []).forEach((value) => {
      if (!value?.id) return
      next.set(String(value.id), {
        id: String(value.id),
        type: String(value.type || 'task'),
        dueDate: String(value.dueDate || ''),
        dueTime: String(value.dueTime || ''),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
      })
    })
    store.state.todos = next
    store.state.todosReady = true
    publish(store)
  }))

  store.subscriptions.push(subscribeClassLiveData('academic', store.classId, (events) => {
    const next = new Map()
    ;(Array.isArray(events) ? events : []).forEach((value) => {
      if (!value?.id) return
      next.set(String(value.id), {
        startDate: String(value.startDate || ''),
        endDate: String(value.endDate || value.startDate || ''),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
        lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),
      })
    })
    store.state.academic = next
    store.state.academicReady = true
    publish(store)
  }))

  store.subscriptions.push(subscribeClassLiveData('todoState', store.studentKey, (todoState) => {
    const nextSeen = new Map()
    const nextTodoState = new Map()
    Object.entries(todoState || {}).forEach(([id, value]) => {
      if (id.startsWith(INTERNAL_PREFIX)) {
        nextSeen.set(id, { updatedAt: Math.max(0, Number(value?.updatedAt || 0)) })
        return
      }
      nextTodoState.set(id, {
        completed: Boolean(value?.completed),
        hidden: Boolean(value?.hidden),
        updatedAt: Number(value?.updatedAt || 0),
      })
    })

    store.state.seen.forEach((value, id) => {
      const localVersion = Number(value?.updatedAt || 0)
      if (localVersion > Number(nextSeen.get(id)?.updatedAt || 0)) nextSeen.set(id, { updatedAt: localVersion })
    })
    store.pendingWrites.forEach((version, id) => {
      if (Number(version || 0) > Number(nextSeen.get(id)?.updatedAt || 0)) nextSeen.set(id, { updatedAt: Number(version || 0) })
    })

    store.state.seen = nextSeen
    store.state.todoState = nextTodoState
    store.state.seenReady = true
    persistReadCache(store)
    publish(store)
    void flushPendingWrites(store)
  }))
}

async function connectStore(store) {
  if (!store?.started || store.connected) return
  if (store.connectPromise) return store.connectPromise
  store.connectPromise = (async () => {
    try {
      await ensureSignedIn()
      if (!store.started || store.connected) return
      store.db = getFirestore(getApp('school-sync'))
      installSubscriptions(store)
      store.connected = true
      void flushPendingWrites(store)
    } catch (error) {
      console.warn('Unread store startup unavailable; retrying:', error)
      if (store.started && !store.retryTimer) {
        store.retryTimer = window.setTimeout(() => {
          store.retryTimer = 0
          void connectStore(store)
        }, 2000)
      }
    }
  })().finally(() => {
    store.connectPromise = null
  })
  return store.connectPromise
}

function startStore(store) {
  if (!store || store.started) return
  store.started = true
  void connectStore(store)

  store.mealTimer = window.setInterval(() => {
    const available = hasTodayMealInCache()
    if (available === store.state.mealAvailable) return
    store.state.mealAvailable = available
    publish(store)
  }, 3000)

  store.onResume = () => {
    if (document.hidden) return
    const available = hasTodayMealInCache()
    if (available !== store.state.mealAvailable) {
      store.state.mealAvailable = available
      publish(store)
    }
    void connectStore(store)
    void flushPendingWrites(store)
  }
  window.addEventListener('focus', store.onResume)
  window.addEventListener('online', store.onResume)
  document.addEventListener('visibilitychange', store.onResume)
}

function stopStore(store) {
  if (!store?.started) return
  store.started = false
  store.connected = false
  store.subscriptions.splice(0).forEach((unsubscribe) => {
    try { unsubscribe() } catch {}
  })
  if (store.onResume) {
    window.removeEventListener('focus', store.onResume)
    window.removeEventListener('online', store.onResume)
    document.removeEventListener('visibilitychange', store.onResume)
  }
  store.onResume = null
  if (store.retryTimer) window.clearTimeout(store.retryTimer)
  if (store.mealTimer) window.clearInterval(store.mealTimer)
  if (store.reminderExpiryTimer) window.clearTimeout(store.reminderExpiryTimer)
  store.retryTimer = 0
  store.mealTimer = 0
  store.reminderExpiryTimer = 0
}

function clampNumberTarget(target, current) {
  const currentVersion = Math.max(0, Number(current || 0))
  const requested = Math.max(0, Number((target ?? currentVersion) || 0))
  return Math.min(currentVersion, requested)
}

export function subscribeUnreadState(profile, listener) {
  if (typeof listener !== 'function') return () => {}
  const store = storeFor(profile)
  if (!store) return () => {}
  store.listeners.add(listener)
  if (store.listeners.size === 1) startStore(store)
  listener(snapshot(store))
  return () => {
    store.listeners.delete(listener)
    if (!store.listeners.size) stopStore(store)
  }
}

export function unreadStateSnapshot(profile) {
  return snapshot(storeFor(profile))
}

export function markUnreadSeen(profile, tab, target = null) {
  const store = storeFor(profile)
  const source = String(tab || '')
  if (!store || !leafUnread(store, source)) return false

  if (source === 'board') {
    const current = Math.max(0, Number(store.state.boardCursor || 0))
    const cursor = clampNumberTarget(target, current)
    if (cursor <= 0) return false
    markPreviewBoardSectionSeen(store.profile, cursor)
    return true
  }

  if (source === 'study') {
    const currentTarget = seenTarget(store, 'study')
    const requested = target && typeof target === 'object' ? target : currentTarget
    const studyTarget = {
      seenAt: clampNumberTarget(requested.seenAt, currentTarget.seenAt),
      seenCursor: clampNumberTarget(requested.seenCursor, currentTarget.seenCursor),
    }
    if (studyTarget.seenCursor <= 0) return false
    markPreviewStudySeen(store.profile, studyTarget)
    return true
  }

  if (!store.state.seenReady) return false
  const current = Number(seenTarget(store, source) || 0)
  const version = clampNumberTarget(target, current)
  const id = NAV_STATE_IDS[source]
  if (!id || version <= 0 || !setSeenLocal(store, id, version)) return false
  publish(store)
  void flushPendingWrites(store)
  return true
}

export function markReminderUnreadSeen(profile, todoId, target = null) {
  const store = storeFor(profile)
  const id = String(todoId || '')
  const todo = store?.state.todos.get(id)
  if (!store || !todo || !reminderRowUnread(store, todo)) return false
  const current = reminderActivityVersion(store, todo)
  const version = clampNumberTarget(target, current)
  if (version <= 0 || !setSeenLocal(store, safeReminderStateId(id), version)) return false
  publish(store)
  void flushPendingWrites(store)
  return true
}
