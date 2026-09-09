import { readStudentProfile } from './school-sync.js'
import {
  markReminderUnreadSeen,
  markUnreadSeen,
  subscribeUnreadState,
} from './unread-store.js'
import './unread-indicators.css'

const VALID_TABS = new Set([
  'home',
  'class',
  'ai',
  'study',
  'schedule',
  'todo',
  'timetable',
  'meal',
  'academic',
  'board',
])

function tabForButton(button) {
  const dataTab = String(button?.dataset?.tab || '').trim()
  return VALID_TABS.has(dataTab) ? dataTab : ''
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

function cloneSeenTarget(target) {
  if (!target || typeof target !== 'object') return Number(target || 0)
  return {
    seenAt: Math.max(0, Number(target.seenAt || 0)),
    seenCursor: Math.max(0, Number(target.seenCursor || 0)),
  }
}

function startUnreadIndicators() {
  const profile = readStudentProfile()
  if (!profile) return false

  let current = {
    revision: 0,
    unread: {},
    targets: {},
    reminderUnreadIds: [],
  }
  let stopped = false
  let renderFrame = 0
  let visibleSeenFrame = 0
  let visibleSeenCommitFrame = 0
  let visibleSeenToken = 0

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

  function scheduleVisibleSeen() {
    if (stopped) return
    const token = ++visibleSeenToken
    if (visibleSeenFrame) window.cancelAnimationFrame(visibleSeenFrame)
    if (visibleSeenCommitFrame) window.cancelAnimationFrame(visibleSeenCommitFrame)

    // Wait for the destination React tree to render once, then capture exactly
    // the cursor that was visible at that point. A newer event cannot be
    // swallowed by this acknowledgement.
    visibleSeenFrame = window.requestAnimationFrame(() => {
      visibleSeenFrame = 0
      if (stopped || token !== visibleSeenToken) return
      const tab = activeLeafTab()
      if (!tab || !current.unread?.[tab]) return
      const capturedTarget = cloneSeenTarget(current.targets?.[tab])

      visibleSeenCommitFrame = window.requestAnimationFrame(() => {
        visibleSeenCommitFrame = 0
        if (stopped || token !== visibleSeenToken) return
        if (activeLeafTab() !== tab || !current.unread?.[tab]) return
        markUnreadSeen(profile, tab, capturedTarget)
      })
    })
  }

  function renderReminderRows() {
    const unreadIds = new Set((current.reminderUnreadIds || []).map(String))
    document.querySelectorAll('.todo-stage5 [data-reminder-id], .todo-page [data-reminder-id]').forEach((row) => {
      if (unreadIds.has(String(row.dataset.reminderId || ''))) addDot(row, 'reminder')
      else removeDot(row)
    })
  }

  function renderTopSegments() {
    document.querySelectorAll('.class-top-segment-button[data-unread-key]').forEach((button) => {
      const tab = String(button.dataset.unreadKey || '')
      if (current.unread?.[tab]) addDot(button, 'segment')
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
      if (current.unread?.[tab]) addDot(button, 'nav')
      else removeDot(button)
    })
  }

  function render() {
    renderReminderRows()
    renderTopSegments()
    renderNav()
    scheduleVisibleSeen()
  }

  function scheduleRender() {
    if (stopped || renderFrame) return
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0
      render()
    })
  }

  function handleClick(event) {
    const reminderMain = event.target.closest?.('.todo-stage5 .todo-item-main, .todo-page .todo-item-main')
    if (reminderMain) {
      const row = reminderMain.closest('[data-reminder-id]')
      const todoId = String(row?.dataset?.reminderId || '')
      if (todoId) markReminderUnreadSeen(profile, todoId)
    }

    // Navigation may be a bottom-nav click, a segment click, or a semantic
    // Home action. Resolve the actual active leaf after React has committed.
    scheduleVisibleSeen()
  }

  const unsubscribe = subscribeUnreadState(profile, (next) => {
    current = next
    scheduleRender()
  })

  const handleResume = () => {
    if (!document.hidden) {
      scheduleRender()
      scheduleVisibleSeen()
    }
  }

  document.addEventListener('click', handleClick, true)
  document.addEventListener('visibilitychange', handleResume)
  window.addEventListener('focus', handleResume)
  scheduleRender()

  window.addEventListener('pagehide', () => {
    stopped = true
    unsubscribe()
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('visibilitychange', handleResume)
    window.removeEventListener('focus', handleResume)
    if (renderFrame) window.cancelAnimationFrame(renderFrame)
    if (visibleSeenFrame) window.cancelAnimationFrame(visibleSeenFrame)
    if (visibleSeenCommitFrame) window.cancelAnimationFrame(visibleSeenCommitFrame)
  }, { once: true })

  return true
}

let startAttempts = 0
function boot() {
  if (startUnreadIndicators()) return
  startAttempts += 1
  if (startAttempts < 180) window.setTimeout(boot, 1000)
}

boot()
