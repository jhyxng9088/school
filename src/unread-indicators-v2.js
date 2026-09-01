import { getApp } from 'firebase/app'
import { collection, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore'
import { classKeyFor, ensureSignedIn, readStudentProfile, studentKeyFor } from './school-sync'
import { reminderActivityEligibleForStudent, reminderExpiryMs } from './reminder-lifecycle.js'
import { markPreviewBoardSectionSeen, subscribePreviewBoardUnread } from './preview-board-unread.js'
import { markPreviewStudySeen, subscribePreviewStudyUnread } from './preview-study-unread.js'
import './unread-indicators.css'

const INTERNAL_PREFIX = '__school_seen_'
const NAV_STATE_IDS = {
  todo: `${INTERNAL_PREFIX}nav_todo`,
  timetable: `${INTERNAL_PREFIX}nav_timetable`,
  academic: `${INTERNAL_PREFIX}nav_academic`,
  meal: `${INTERNAL_PREFIX}nav_meal`,
}
const REMINDER_ROW_BASELINE_ID = `${INTERNAL_PREFIX}reminder_rows_v3`
const ACADEMIC_BASELINE_ID = `${INTERNAL_PREFIX}academic_v2`
const MEAL_CACHE_KEY = 'school.stage3.meals.v1'
const LABEL_TO_TAB = {
  '리마인더': 'todo',
  '투두': 'todo',
  '시간표': 'timetable',
  '급식': 'meal',
  '학사일정': 'academic',
  '우리반': 'class',
  '스터디': 'study',
  '일정': 'schedule',
}
const V2_TABS = new Set(['home', 'class', 'ai', 'study', 'schedule'])

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

function tabForButton(button) {
  const dataTab = String(button?.dataset?.tab || '').trim()
  if (V2_TABS.has(dataTab)) return dataTab
  const label = button?.querySelector('span')?.textContent?.trim() || ''
  return LABEL_TO_TAB[label] || ''
}

function addDot(container, kind) {
  if (!container) return
  const className = kind === 'nav'
    ? 'school-unread-dot is-nav'
    : kind === 'segment'
      ? 'school-unread-dot is-segment'
      : 'school-unread-dot is-reminder'
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
    todoState: new Map(),
    timetableOverrides: {},
    activityReady: false,
    seenReady: false,
    todosReady: false,
    timetableReady: false,
    academicReady: false,
    mealAvailable: hasTodayMealInCache(),
    boardUnread: false,
    studyUnread: false,
    stopped: false,
  }

  let renderFrame = 0
  let reminderExpiryTimer = 0
  const subscriptions = []
  const pendingWrites = new Map()

  function scheduleRender() {
    if (state.stopped || renderFrame) return
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0
      render()
    })
  }

  function scheduleNextReminderExpiry() {
    if (reminderExpiryTimer) {
      window.clearTimeout(reminderExpiryTimer)
      reminderExpiryTimer = 0
    }
    const nowMs = Date.now()
    const nextExpiry = [...state.todos.values()]
      .map(reminderExpiryMs)
      .filter((value) => Number.isFinite(value) && value > nowMs)
      .sort((a, b) => a - b)[0]
    if (!nextExpiry) return
    const delay = Math.max(20, Math.min(nextExpiry - nowMs + 20, 2_147_000_000))
    reminderExpiryTimer = window.setTimeout(() => {
      reminderExpiryTimer = 0
      scheduleRender()
    }, delay)
  }

  function timetableActivityStillRelevant(activity) {
    if (!activity || activity.entityType !== 'timetable') return true
    const match = /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(String(activity.entityId || ''))
    if (!match) return true
    const [, date, period] = match
    if (date < todayDateKey()) return false
    return Boolean(String(state.timetableOverrides?.[date]?.[String(Number(period))] || '').trim())
  }

  function otherActivityVersion(entityType) {
    let latest = 0
    state.activity.forEach((value) => {
      if (value.entityType !== entityType) return
      if (value.actorStudentKey && value.actorStudentKey === studentKey) return
      if (entityType === 'timetable' && !timetableActivityStillRelevant(value)) return
      latest = Math.max(latest, Number(value.updatedAt || 0))
    })
    return latest
  }

  function academicEventStillRelevant(value) {
    const endDate = String(value?.endDate || value?.startDate || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false
    return endDate >= todayDateKey()
  }

  function academicVersion() {
    let latest = 0
    state.academic.forEach((value) => {
      if (!academicEventStillRelevant(value)) return
      if (value.lastEditedByStudentKey && value.lastEditedByStudentKey === studentKey) return
      latest = Math.max(latest, Number(value.updatedAt || value.createdAt || 0))
    })
    return latest
  }

  function seenVersion(id) {
    return Number(state.seen.get(id)?.updatedAt || 0)
  }

  function reminderActivity(todo) {
    if (!todo?.id) return null
    const personalState = state.todoState.get(String(todo.id)) || null
    if (!reminderActivityEligibleForStudent(todo, personalState)) return null
    const activity = state.activity.get(`reminder:${todo.id}`)
    if (!activity) return null
    if (!['added', 'edited'].includes(activity.action)) return null
    if (activity.actorStudentKey && activity.actorStudentKey === studentKey) return null
    const updatedAt = Number(activity.updatedAt || 0)
    if (updatedAt <= 0) return null
    return { ...activity, updatedAt }
  }

  function reminderActivityVersion(todo) {
    return Number(reminderActivity(todo)?.updatedAt || 0)
  }

  function latestReminderActivityVersion() {
    let latest = 0
    state.todos.forEach((todo) => {
      latest = Math.max(latest, reminderActivityVersion(todo))
    })
    return latest
  }

  function reminderRowUnread(todo) {
    if (!state.activityReady || !state.seenReady || !state.todosReady || !todo) return false
    const baseline = seenVersion(REMINDER_ROW_BASELINE_ID)
    if (baseline <= 0) return false
    const version = reminderActivityVersion(todo)
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
      if (!state.activityReady || !state.seenReady || !state.todosReady) return false
      const baseline = seenVersion(REMINDER_ROW_BASELINE_ID)
      return latestReminderActivityVersion() > Math.max(seenVersion(NAV_STATE_IDS.todo), baseline)
        || hasUnreadReminderRow()
    }
    if (tab === 'timetable') {
      if (!state.activityReady || !state.seenReady || !state.timetableReady) return false
      return otherActivityVersion('timetable') > seenVersion(NAV_STATE_IDS.timetable)
    }
    if (tab === 'academic') {
      if (!state.seenReady || !state.academicReady) return false
      return academicVersion() > Math.max(seenVersion(NAV_STATE_IDS.academic), seenVersion(ACADEMIC_BASELINE_ID))
    }
    if (tab === 'meal') {
      return state.seenReady
        && state.mealAvailable
        && todayVersion() > seenVersion(NAV_STATE_IDS.meal)
    }
    if (tab === 'board') return state.boardUnread
    if (tab === 'study') return state.studyUnread
    if (tab === 'class') return navUnread('timetable') || navUnread('board')
    if (tab === 'schedule') return navUnread('todo') || navUnread('academic') || navUnread('meal')
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
    if (!state.activityReady || !state.seenReady || !state.todosReady) return
    if (seenVersion(REMINDER_ROW_BASELINE_ID) > 0) return
    writeSeen(REMINDER_ROW_BASELINE_ID, Math.max(1, latestReminderActivityVersion()))
  }

  function ensureTimetableBaseline() {
    if (!state.activityReady || !state.seenReady || !state.timetableReady) return
    if (seenVersion(NAV_STATE_IDS.timetable) > 0) return
    writeSeen(NAV_STATE_IDS.timetable, Math.max(1, otherActivityVersion('timetable')))
  }

  function ensureAcademicBaseline() {
    if (!state.seenReady || !state.academicReady) return
    if (seenVersion(ACADEMIC_BASELINE_ID) > 0) return
    writeSeen(ACADEMIC_BASELINE_ID, Math.max(1, academicVersion()))
  }

  function markTabSeen(tab) {
    if (tab === 'todo') writeSeen(NAV_STATE_IDS.todo, latestReminderActivityVersion())
    else if (tab === 'timetable') writeSeen(NAV_STATE_IDS.timetable, otherActivityVersion('timetable'))
    else if (tab === 'academic') writeSeen(NAV_STATE_IDS.academic, academicVersion())
    else if (tab === 'meal' && state.mealAvailable) writeSeen(NAV_STATE_IDS.meal, todayVersion())
    else if (tab === 'board') markPreviewBoardSectionSeen(profile)
    else if (tab === 'study') markPreviewStudySeen(profile)
  }

  function activeLeafTab() {
    const active = document.querySelector('.bottom-nav .nav-button.active')
    const tab = tabForButton(active)
    if (tab === 'class') {
      return String(document.querySelector('.class-station-page .class-top-segment-button.is-active[data-unread-key]')?.dataset?.unreadKey || '')
    }
    if (tab === 'schedule') {
      return String(document.querySelector('.station-schedule-page .class-top-segment-button.is-active[data-unread-key]')?.dataset?.unreadKey || '')
    }
    return tab
  }

  function renderReminderRows() {
    document.querySelectorAll('.todo-stage5 [data-reminder-id], .todo-page [data-reminder-id]').forEach((row) => {
      const todo = state.todos.get(String(row.dataset.reminderId || ''))
      if (reminderRowUnread(todo)) addDot(row, 'reminder')
      else removeDot(row)
    })
  }

  function renderTopSegments() {
    document.querySelectorAll('.class-top-segment-button[data-unread-key]').forEach((button) => {
      const tab = String(button.dataset.unreadKey || '')
      if (navUnread(tab)) addDot(button, 'segment')
      else removeDot(button)
    })
  }

  function renderNav() {
    document.querySelectorAll('.bottom-nav .nav-button').forEach((button) => {
      const tab = tabForButton(button)
      if (!tab || tab === 'home' || tab === 'ai') {
        removeDot(button)
        return
      }
      if (navUnread(tab)) addDot(button, 'nav')
      else removeDot(button)
    })
  }

  function render() {
    state.mealAvailable = hasTodayMealInCache()
    ensureReminderBaseline()
    ensureTimetableBaseline()
    ensureAcademicBaseline()
    renderReminderRows()
    renderTopSegments()
    renderNav()
    scheduleNextReminderExpiry()
    const tab = activeLeafTab()
    if (tab) markTabSeen(tab)
  }

  function markReminderSeen(todo) {
    if (!todo || !reminderRowUnread(todo)) return
    writeSeen(safeReminderStateId(todo.id), reminderActivityVersion(todo))
  }

  function handleClick(event) {
    const segmentButton = event.target.closest?.('.class-top-segment-button[data-unread-key]')
    if (segmentButton) {
      const tab = String(segmentButton.dataset.unreadKey || '')
      if (tab) markTabSeen(tab)
      return
    }

    const navButton = event.target.closest?.('.bottom-nav .nav-button')
    if (navButton) {
      const tab = tabForButton(navButton)
      // Parent stations aggregate their children. Opening a parent must not clear
      // siblings the student has not actually viewed.
      if (tab && !['class', 'schedule'].includes(tab)) markTabSeen(tab)
      return
    }

    const reminderMain = event.target.closest?.('.todo-stage5 .todo-item-main, .todo-page .todo-item-main')
    if (!reminderMain) return
    const row = reminderMain.closest('[data-reminder-id]')
    const todo = state.todos.get(String(row?.dataset.reminderId || ''))
    if (todo) markReminderSeen(todo)
  }

  subscriptions.push(subscribePreviewBoardUnread(profile, (next) => {
    const unread = Boolean(next?.hasSectionUnread)
    if (unread !== state.boardUnread) {
      state.boardUnread = unread
      scheduleRender()
    }
  }))

  subscriptions.push(subscribePreviewStudyUnread(profile, (next) => {
    const unread = Boolean(next?.hasUnread)
    if (unread !== state.studyUnread) {
      state.studyUnread = unread
      scheduleRender()
    }
  }))

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

  subscriptions.push(onSnapshot(doc(db, 'classes', classId, 'settings', 'timetable'), (snapshot) => {
    const rawOverrides = snapshot.exists() ? snapshot.data()?.overrides : null
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
    state.timetableOverrides = nextOverrides
    state.timetableReady = true
    scheduleRender()
  }, (error) => {
    state.timetableReady = false
    console.error('Unread timetable sync failed:', error)
    scheduleRender()
  }))

  subscriptions.push(onSnapshot(collection(db, 'classes', classId, 'todos'), (snapshot) => {
    const next = new Map()
    snapshot.docs.forEach((item) => {
      const value = item.data() || {}
      next.set(item.id, {
        id: item.id,
        dueDate: String(value.dueDate || ''),
        dueTime: String(value.dueTime || ''),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
      })
    })
    state.todos = next
    state.todosReady = true
    scheduleRender()
  }, (error) => {
    state.todosReady = false
    console.error('Unread reminder sync failed:', error)
    scheduleRender()
  }))

  subscriptions.push(onSnapshot(collection(db, 'classes', classId, 'academicEvents'), (snapshot) => {
    const next = new Map()
    snapshot.docs.forEach((item) => {
      const value = item.data() || {}
      next.set(item.id, {
        startDate: String(value.startDate || ''),
        endDate: String(value.endDate || value.startDate || ''),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || value.createdAt || 0),
        lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),
      })
    })
    state.academic = next
    state.academicReady = true
    scheduleRender()
  }, (error) => {
    state.academicReady = false
    console.error('Unread academic sync failed:', error)
    scheduleRender()
  }))

  subscriptions.push(onSnapshot(collection(db, 'students', studentKey, 'todoState'), (snapshot) => {
    if (snapshot.metadata?.fromCache) return

    const nextSeen = new Map()
    const nextTodoState = new Map()
    snapshot.docs.forEach((item) => {
      const value = item.data() || {}
      if (item.id.startsWith(INTERNAL_PREFIX)) {
        nextSeen.set(item.id, { updatedAt: Number(value.updatedAt || 0) })
        return
      }
      nextTodoState.set(item.id, {
        completed: Boolean(value.completed),
        hidden: Boolean(value.hidden),
        updatedAt: Number(value.updatedAt || 0),
      })
    })
    pendingWrites.forEach((version, id) => {
      if (Number(version || 0) > Number(nextSeen.get(id)?.updatedAt || 0)) {
        nextSeen.set(id, { updatedAt: Number(version || 0) })
      }
    })
    state.seen = nextSeen
    state.todoState = nextTodoState
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
    if (reminderExpiryTimer) window.clearTimeout(reminderExpiryTimer)
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
