import { getApp } from 'firebase/app'
import { collection, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore'
import { classKeyFor, ensureSignedIn, readStudentProfile, studentKeyFor } from './school-sync'
import './unread-indicators.css'

const INTERNAL_PREFIX = '__school_seen_'
const NAV_STATE_IDS = {
  todo: `${INTERNAL_PREFIX}nav_todo`,
  timetable: `${INTERNAL_PREFIX}nav_timetable`,
  academic: `${INTERNAL_PREFIX}nav_academic`,
  meal: `${INTERNAL_PREFIX}nav_meal`,
}
const REMINDER_ROW_BASELINE_ID = `${INTERNAL_PREFIX}reminder_rows_v2`
const PENDING_SUMMARY_HEADING = '\u2063school-summary-pending\u2063'
const ATTACHMENT_MANIFEST_HEADING = '\u2063school-attachments\u2063'
const MEAL_CACHE_KEY = 'school.stage3.meals.v1'
const LABEL_TO_TAB = {
  '리마인더': 'todo',
  '투두': 'todo',
  '시간표': 'timetable',
  '급식': 'meal',
  '학사일정': 'academic',
}

function safeReminderStateId(todoId) {
  const safe = String(todoId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
  return `${INTERNAL_PREFIX}summary_v2_${safe}`
}

function readableSummary(summary) {
  if (!summary || typeof summary !== 'object') return false
  const sections = Array.isArray(summary.sections) ? summary.sections : []
  if (sections.some((section) => section?.heading === PENDING_SUMMARY_HEADING)) return false
  if (String(summary.overview || '').trim()) return true
  return sections.some((section) => (
    section?.heading !== ATTACHMENT_MANIFEST_HEADING
    && section?.heading !== PENDING_SUMMARY_HEADING
    && Array.isArray(section?.items)
    && section.items.some((item) => String(item || '').trim())
  ))
}

function todayRawDate() {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
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

function tabForButton(button) {
  const label = button?.querySelector('span')?.textContent?.trim() || ''
  return LABEL_TO_TAB[label] || ''
}

function addDot(container, kind) {
  if (!container) return
  const className = kind === 'nav' ? 'school-unread-dot is-nav' : 'school-unread-dot is-reminder'
  let dot = Array.from(container.children).find((child) => child.classList?.contains('school-unread-dot'))
  if (!dot) {
    dot = document.createElement('i')
    dot.setAttribute('aria-hidden', 'true')
    dot.className = className
    container.appendChild(dot)
    return
  }
  if (dot.className !== className) dot.className = className
}

function removeDot(container) {
  if (!container) return
  Array.from(container.children)
    .filter((child) => child.classList?.contains('school-unread-dot'))
    .forEach((dot) => dot.remove())
}

async function startUnreadIndicators() {
  const profile = readStudentProfile()
  if (!profile) return false

  await ensureSignedIn()
  const syncApp = getApp('school-sync')
  const db = getFirestore(syncApp)
  const classId = classKeyFor(profile)
  const studentKey = studentKeyFor(profile)
  if (!classId || !studentKey) return false

  const state = {
    activity: new Map(),
    todos: new Map(),
    academic: new Map(),
    seen: new Map(),
    activityReady: false,
    seenReady: false,
    mealAvailable: hasTodayMealInCache(),
    stopped: false,
  }

  let renderFrame = 0
  const subscriptions = []
  const pendingWrites = new Map()

  function scheduleRender() {
    if (state.stopped || renderFrame) return
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0
      render()
    })
  }

  function otherActivityVersion(entityType) {
    let latest = 0
    state.activity.forEach((value) => {
      if (value.entityType !== entityType) return
      if (value.actorStudentKey && value.actorStudentKey === studentKey) return
      latest = Math.max(latest, Number(value.updatedAt || 0))
    })
    return latest
  }

  function academicVersion() {
    let latest = 0
    state.academic.forEach((value) => {
      if (value.lastEditedByStudentKey && value.lastEditedByStudentKey === studentKey) return
      latest = Math.max(latest, Number(value.updatedAt || value.createdAt || 0))
    })
    return latest
  }

  function seenVersion(id) {
    return Number(state.seen.get(id)?.updatedAt || 0)
  }

  function reminderEditVersion(todo) {
    if (!todo?.id) return 0
    const activity = state.activity.get(`reminder:${todo.id}`)
    if (!activity || activity.action !== 'edited') return 0
    if (activity.actorStudentKey && activity.actorStudentKey === studentKey) return 0
    return Number(activity.updatedAt || 0)
  }

  function reminderRowUnread(todo) {
    if (!state.activityReady || !state.seenReady) return false
    if (!todo || !readableSummary(todo.summary)) return false
    const baseline = seenVersion(REMINDER_ROW_BASELINE_ID)
    if (baseline <= 0) return false
    const version = reminderEditVersion(todo)
    if (version <= 0) return false
    return version > Math.max(baseline, seenVersion(safeReminderStateId(todo.id)))
  }

  function hasUnreadReminderRow() {
    for (const todo of state.todos.values()) {
      if (reminderRowUnread(todo)) return true
    }
    return false
  }

  function navUnread(tab) {
    if (tab === 'todo') {
      const baseline = seenVersion(REMINDER_ROW_BASELINE_ID)
      return otherActivityVersion('reminder') > Math.max(seenVersion(NAV_STATE_IDS.todo), baseline)
        || hasUnreadReminderRow()
    }
    if (tab === 'timetable') {
      return otherActivityVersion('timetable') > seenVersion(NAV_STATE_IDS.timetable)
    }
    if (tab === 'academic') {
      return academicVersion() > seenVersion(NAV_STATE_IDS.academic)
    }
    if (tab === 'meal') {
      return state.mealAvailable && todayVersion() > seenVersion(NAV_STATE_IDS.meal)
    }
    return false
  }

  function writeSeen(id, version) {
    const nextVersion = Number(version || 0)
    if (!id || nextVersion <= 0 || seenVersion(id) >= nextVersion) return
    if (Number(pendingWrites.get(id) || 0) >= nextVersion) return

    pendingWrites.set(id, nextVersion)
    state.seen.set(id, { updatedAt: nextVersion })
    scheduleRender()

    setDoc(doc(db, 'students', studentKey, 'todoState', id), {
      completed: false,
      hidden: false,
      updatedAt: nextVersion,
    }, { merge: true }).catch((error) => {
      console.error('Unread state save failed:', error)
    }).finally(() => {
      if (pendingWrites.get(id) === nextVersion) pendingWrites.delete(id)
    })
  }

  function ensureReminderBaseline() {
    if (!state.activityReady || !state.seenReady) return
    if (seenVersion(REMINDER_ROW_BASELINE_ID) > 0) return
    // Treat everything that existed before this fixed implementation as already seen.
    // Any later edit gets a strictly newer activity timestamp and is tracked per ID.
    writeSeen(REMINDER_ROW_BASELINE_ID, Math.max(1, otherActivityVersion('reminder')))
  }

  function markTabSeen(tab) {
    if (tab === 'todo') writeSeen(NAV_STATE_IDS.todo, otherActivityVersion('reminder'))
    else if (tab === 'timetable') writeSeen(NAV_STATE_IDS.timetable, otherActivityVersion('timetable'))
    else if (tab === 'academic') writeSeen(NAV_STATE_IDS.academic, academicVersion())
    else if (tab === 'meal' && state.mealAvailable) writeSeen(NAV_STATE_IDS.meal, todayVersion())
  }

  function activeTab() {
    const active = document.querySelector('.bottom-nav .nav-button.active')
    return tabForButton(active)
  }

  function renderReminderRows() {
    document.querySelectorAll('.todo-stage5 [data-reminder-id]').forEach((row) => {
      const todo = state.todos.get(String(row.dataset.reminderId || ''))
      if (reminderRowUnread(todo)) addDot(row, 'reminder')
      else removeDot(row)
    })
  }

  function renderNav() {
    document.querySelectorAll('.bottom-nav .nav-button').forEach((button) => {
      const tab = tabForButton(button)
      if (!tab) return
      if (navUnread(tab)) addDot(button, 'nav')
      else removeDot(button)
    })
  }

  function render() {
    state.mealAvailable = hasTodayMealInCache()
    ensureReminderBaseline()
    renderReminderRows()
    renderNav()
    const tab = activeTab()
    if (tab) markTabSeen(tab)
  }

  function waitForSummaryOpen(todo) {
    if (!todo || !reminderRowUnread(todo)) return
    let done = false
    let observer = null
    let timeout = 0

    const finish = () => {
      if (done) return
      const sheet = document.querySelector('.reminder-summary-layer .reminder-summary-sheet')
      if (!sheet) return
      done = true
      observer?.disconnect()
      if (timeout) window.clearTimeout(timeout)
      writeSeen(safeReminderStateId(todo.id), reminderEditVersion(todo))
    }

    observer = new MutationObserver(finish)
    observer.observe(document.body, { childList: true, subtree: true })
    timeout = window.setTimeout(() => observer?.disconnect(), 1600)
    window.requestAnimationFrame(finish)
  }

  function handleClick(event) {
    const navButton = event.target.closest?.('.bottom-nav .nav-button')
    if (navButton) {
      const tab = tabForButton(navButton)
      if (tab) markTabSeen(tab)
      return
    }

    const summaryButton = event.target.closest?.('.todo-stage5 .todo-item-main.has-summary')
    if (!summaryButton) return
    const row = summaryButton.closest('[data-reminder-id]')
    const todo = state.todos.get(String(row?.dataset.reminderId || ''))
    if (todo) waitForSummaryOpen(todo)
  }

  subscriptions.push(onSnapshot(collection(db, 'classes', classId, 'activity'), (snapshot) => {
    const next = new Map()
    snapshot.docs.forEach((item) => {
      const value = item.data() || {}
      if (!value.entityType || !value.entityId) return
      next.set(`${value.entityType}:${value.entityId}`, {
        entityType: String(value.entityType),
        entityId: String(value.entityId),
        actorStudentKey: String(value.actorStudentKey || ''),
        action: value.action === 'added' ? 'added' : 'edited',
        updatedAt: Number(value.updatedAt || 0),
      })
    })
    state.activity = next
    state.activityReady = true
    scheduleRender()
  }, (error) => console.error('Unread activity sync failed:', error)))

  subscriptions.push(onSnapshot(collection(db, 'classes', classId, 'todos'), (snapshot) => {
    const next = new Map()
    snapshot.docs.forEach((item) => {
      const value = item.data() || {}
      next.set(item.id, {
        id: item.id,
        summary: value.summary || null,
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
      })
    })
    state.todos = next
    scheduleRender()
  }, (error) => console.error('Unread reminder sync failed:', error)))

  subscriptions.push(onSnapshot(collection(db, 'classes', classId, 'academicEvents'), (snapshot) => {
    const next = new Map()
    snapshot.docs.forEach((item) => {
      const value = item.data() || {}
      next.set(item.id, {
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
        lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),
      })
    })
    state.academic = next
    scheduleRender()
  }, (error) => console.error('Unread academic sync failed:', error)))

  subscriptions.push(onSnapshot(collection(db, 'students', studentKey, 'todoState'), (snapshot) => {
    const next = new Map()
    snapshot.docs.forEach((item) => {
      if (!item.id.startsWith(INTERNAL_PREFIX)) return
      next.set(item.id, { updatedAt: Number(item.data()?.updatedAt || 0) })
    })
    pendingWrites.forEach((version, id) => {
      if (Number(version || 0) > Number(next.get(id)?.updatedAt || 0)) {
        next.set(id, { updatedAt: Number(version || 0) })
      }
    })
    state.seen = next
    state.seenReady = true
    scheduleRender()
  }, (error) => console.error('Unread seen-state sync failed:', error)))

  document.addEventListener('click', handleClick, true)
  const domObserver = new MutationObserver(scheduleRender)
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  const mealTimer = window.setInterval(() => {
    const available = hasTodayMealInCache()
    if (available !== state.mealAvailable) {
      state.mealAvailable = available
      scheduleRender()
    }
  }, 3000)

  const refresh = () => scheduleRender()
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('focus', refresh)
  scheduleRender()

  window.addEventListener('pagehide', () => {
    state.stopped = true
    subscriptions.forEach((unsubscribe) => unsubscribe())
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('focus', refresh)
    domObserver.disconnect()
    window.clearInterval(mealTimer)
    if (renderFrame) window.cancelAnimationFrame(renderFrame)
  }, { once: true })

  return true
}

let startAttempts = 0
function boot() {
  startUnreadIndicators().then((started) => {
    if (started) return
    startAttempts += 1
    if (startAttempts < 180) window.setTimeout(boot, 1000)
  }).catch((error) => {
    console.error('Unread indicators v2 failed to start:', error)
    startAttempts += 1
    if (startAttempts < 20) window.setTimeout(boot, 1500)
  })
}

boot()
