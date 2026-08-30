import {
  academicTomorrowBody,
  activeForStudent,
  isImportantAcademic,
  isNightPreviewWindow,
  isReminderHourDue,
  reminderHourBody,
  reminderTomorrowBody,
  tomorrowDateKey,
  validTime,
} from './schedule-logic.js'

function groupSubscriptionsByStudent(subscriptions) {
  const map = new Map()
  for (const subscription of subscriptions || []) {
    const studentKey = String(subscription?.studentKey || '')
    if (!studentKey) continue
    if (!map.has(studentKey)) map.set(studentKey, [])
    map.get(studentKey).push(subscription)
  }
  return map
}

export function planClassNotifications({
  classId,
  subscriptions = [],
  todos = [],
  statesByStudent = new Map(),
  academicEvents = [],
  nowMs = Date.now(),
}) {
  const plans = []
  const subscriptionsByStudent = groupSubscriptionsByStudent(subscriptions)
  if (!subscriptionsByStudent.size) return plans

  const hourlyTodos = (todos || []).filter((todo) => isReminderHourDue(todo, nowMs))
  const hourlyTodoIds = new Set(hourlyTodos.map((todo) => String(todo.id || '')))

  for (const todo of hourlyTodos) {
    const todoId = String(todo.id || '')
    if (!todoId) continue
    for (const [studentKey, studentSubscriptions] of subscriptionsByStudent) {
      const state = statesByStudent.get(studentKey)?.get(todoId) || null
      if (!activeForStudent(todo, state)) continue
      plans.push({
        key: `reminder-hour|${classId}|${studentKey}|${todoId}|${todo.dueDate}|${todo.dueTime}`,
        type: 'reminder-hour',
        studentKey,
        recipients: studentSubscriptions,
        payload: {
          title: 'S-Hub',
          body: reminderHourBody(todo.title),
          tag: `reminder-hour-${todoId}`,
          url: './?tab=todo',
        },
      })
    }
  }

  if (!isNightPreviewWindow(nowMs)) return plans

  const tomorrow = tomorrowDateKey(nowMs)
  const tomorrowTodos = (todos || []).filter((todo) => (
    String(todo?.dueDate || '') === tomorrow
    && !validTime(todo?.dueTime)
    && !hourlyTodoIds.has(String(todo?.id || ''))
  ))

  for (const [studentKey, studentSubscriptions] of subscriptionsByStudent) {
    const stateMap = statesByStudent.get(studentKey) || new Map()
    const activeTodos = tomorrowTodos.filter((todo) => (
      activeForStudent(todo, stateMap.get(String(todo.id || '')) || null)
    ))
    if (!activeTodos.length) continue
    plans.push({
      key: `reminder-tomorrow|${classId}|${studentKey}|${tomorrow}`,
      type: 'reminder-tomorrow',
      studentKey,
      recipients: studentSubscriptions,
      payload: {
        title: 'S-Hub',
        body: reminderTomorrowBody(activeTodos),
        tag: `reminder-tomorrow-${tomorrow}`,
        url: './?tab=todo',
      },
    })
  }

  const importantTomorrow = (academicEvents || []).filter((event) => (
    String(event?.startDate || '') === tomorrow
    && isImportantAcademic(event)
  ))
  if (importantTomorrow.length) {
    for (const [studentKey, studentSubscriptions] of subscriptionsByStudent) {
      plans.push({
        key: `academic-tomorrow|${classId}|${studentKey}|${tomorrow}`,
        type: 'academic-tomorrow',
        studentKey,
        recipients: studentSubscriptions,
        payload: {
          title: 'S-Hub',
          body: academicTomorrowBody(importantTomorrow),
          tag: `academic-tomorrow-${tomorrow}`,
          url: './?tab=academic',
        },
      })
    }
  }

  return plans
}