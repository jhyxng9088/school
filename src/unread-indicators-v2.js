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
  let navigationSettleFrame = 0
  let navigationSettlePasses = 0

  function activeTopTab() {
    const semanticActive = document.querySelector('.bottom-nav .nav-button[aria-current="page"]')
    return tabForButton(semanticActive || document.querySelector('.bottom-nav .nav-button.active'))
  }

  function activeLeafTab() {
    const tab = activeTopTab()
    if (tab === 'class') {
      return String(document.querySelector('.class-station-page .class-top-segment-button.is-active[data-unread-key]')?.dataset?.unreadKey || '')
    }
    if (tab === 'schedule') {
      return String(document.querySelector('.station-schedule-page .class-top-segment-button.is-active[data-unread-key]')?.dataset?.unreadKey || '')
    }
    return tab
  }

  function hasUnreadReminderRows() {
    return Array.isArray(current.reminderUnreadIds) && current.reminderUnreadIds.length > 0
  }

  function parentHasUnreadOutsideActiveLeaf(parent, leaf) {
    if (parent === 'class') {
      return ['timetable', 'board'].some((tab) => tab !== leaf && current.unread?.[tab])
    }
    if (parent === 'schedule') {
      if (leaf === 'todo' && hasUnreadReminderRows()) return true
      return ['todo', 'academic', 'meal'].some((tab) => tab !== leaf && current.unread?.[tab])
    }
    return false
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
    const activeLeaf = activeLeafTab()
    document.querySelectorAll('.class-top-segment-button[data-unread-key]').forEach((button) => {
      const tab = String(button.dataset.unreadKey || '')
      const keepNestedReminderUnread = tab === 'todo' && tab === activeLeaf && hasUnreadReminderRows()
      if (tab === activeLeaf && !keepNestedReminderUnread) {
        removeDot(button)
        return
      }
      if (current.unread?.[tab]) addDot(button, 'segment')
      else removeDot(button)
    })
  }

  function renderNav() {
    const activeTop = activeTopTab()
    const activeLeaf = activeLeafTab()
    document.querySelectorAll('.bottom-nav .nav-button').forEach((button) => {
      const tab = tabForButton(button)
      if (!tab || tab === 'home' || tab === 'ai') {
        removeDot(button)
        return
      }
      if (tab === activeTop) {
        if (tab === activeLeaf) {
          removeDot(button)
          return
        }
        if ((tab === 'class' || tab === 'schedule') && activeLeaf) {
          if (parentHasUnreadOutsideActiveLeaf(tab, activeLeaf)) addDot(button, 'nav')
          else removeDot(button)
          return
        }
      }
      if (current.unread?.[tab]) addDot(button, 'nav')
      else removeDot(button)
    })
  }

  function renderMountedUnreadUi() {
    renderReminderRows()
    renderTopSegments()
    renderNav()
  }

  function render() {
    renderMountedUnreadUi()
    scheduleVisibleSeen()
  }

  function scheduleRender() {
    if (stopped || renderFrame) return
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0
      render()
    })
  }

  function scheduleNavigationSettle() {
    if (stopped) return
    navigationSettlePasses = Math.max(navigationSettlePasses, 6)
    if (navigationSettleFrame) return

    const settle = () => {
      navigationSettleFrame = 0
      if (stopped) return

      // The station/page and its segmented controls can mount after the click
      // that changed navigation. Repaint unread UI for a few frames so an
      // already-known child unread (for example timetable) is attached to the
      // newly mounted segment instead of remaining visible only on the parent.
      renderMountedUnreadUi()
      navigationSettlePasses -= 1
      if (navigationSettlePasses > 0) {
        navigationSettleFrame = window.requestAnimationFrame(settle)
        return
      }

      // Acknowledge only after the destination has settled. This also makes
      // entering Study itself sufficient to clear Study unread; opening a
      // student's detail sheet is no longer needed to trigger a second click.
      scheduleVisibleSeen()
    }

    navigationSettleFrame = window.requestAnimationFrame(settle)
  }

  function handleClick(event) {
    const reminderMain = event.target.closest?.('.todo-stage5 .todo-item-main, .todo-page .todo-item-main')
    if (reminderMain) {
      const row = reminderMain.closest('[data-reminder-id]')
      const todoId = String(row?.dataset?.reminderId || '')
      if (todoId) markReminderUnreadSeen(profile, todoId)
    }

    const navigationControl = event.target.closest?.(
      '.bottom-nav .nav-button, .class-top-segment-button[data-unread-key], .home-nav-action',
    )
    if (navigationControl) {
      scheduleNavigationSettle()
      return
    }

    // Keep the old generic acknowledgement path for clicks inside an already
    // visible station, but navigation no longer depends on a second click.
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
    if (navigationSettleFrame) window.cancelAnimationFrame(navigationSettleFrame)
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
