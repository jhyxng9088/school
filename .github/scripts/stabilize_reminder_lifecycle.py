from pathlib import Path
import json
import re
import textwrap

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text()


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path, old, new):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:100]!r}')
    write(path, content.replace(old, new, 1))


# One shared definition for what is expired/visible to a student.
write('src/reminder-lifecycle.js', textwrap.dedent(r'''\
export function validReminderDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

export function validReminderTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
}

export function reminderExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!validReminderDate(dueDate)) return Number.POSITIVE_INFINITY

  const dueTime = String(todo?.dueTime || '').trim()
  const expiryTime = validReminderTime(dueTime) ? `${dueTime}:00.000` : '23:59:59.000'
  const expiry = Date.parse(`${dueDate}T${expiryTime}+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}

export function isReminderExpired(todo, nowMs = Date.now()) {
  return reminderExpiryMs(todo) <= Number(nowMs)
}

// completed means "I finished it" but the shared reminder is still subscribed.
// hidden means "I deleted it for myself" and must suppress rows, dots, and edit pushes.
export function reminderActivityEligibleForStudent(todo, personalState, nowMs = Date.now()) {
  if (personalState?.hidden === true) return false
  return !isReminderExpired(todo, nowMs)
}
'''))

# todo.jsx: use the shared expiry definition and physically clean an expired shared
# reminder immediately even while the currently deployed Firestore rule still only
# allows direct deletion after the calendar day has passed.
replace_once(
    'src/todo.jsx',
    "import { recordClassActivity } from './class-activity'\n",
    "import { recordClassActivity } from './class-activity'\nimport { isReminderExpired, reminderExpiryMs } from './reminder-lifecycle.js'\n",
)

old_expiry_block = r'''function todoExpiryMs(todo) {
  const dueDate = String(todo?.dueDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return Number.POSITIVE_INFINITY

  const dueTime = String(todo?.dueTime || '').trim()
  const expiryTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)
    ? `${dueTime}:00.000`
    : '23:59:59.000'
  const expiry = Date.parse(`${dueDate}T${expiryTime}+09:00`)
  return Number.isFinite(expiry) ? expiry : Number.POSITIVE_INFINITY
}

function isTodoExpired(todo, nowMs = Date.now()) {
  return todoExpiryMs(todo) <= nowMs
}

function visibleUnexpiredTodos(todos, nowMs = Date.now()) {
  return (todos || []).filter((todo) => !isTodoExpired(todo, nowMs))
}
'''
new_expiry_block = r'''function visibleUnexpiredTodos(todos, nowMs = Date.now()) {
  return (todos || []).filter((todo) => !isReminderExpired(todo, nowMs))
}
'''
replace_once('src/todo.jsx', old_expiry_block, new_expiry_block)
replace_once('src/todo.jsx', '      .map(todoExpiryMs)\n', '      .map(reminderExpiryMs)\n')
replace_once(
    'src/todo.jsx',
    '    const expired = sourceTodos.filter((todo) => isTodoExpired(todo, expiryClock))\n',
    '    const expired = sourceTodos.filter((todo) => isReminderExpired(todo, expiryClock))\n',
)
replace_once(
    'src/todo.jsx',
    '''      deleteExpiredSharedTodo(profile, todo.id)\n        .catch((error) => {\n          console.error('Expired shared reminder delete failed:', error)\n          window.setTimeout(() => expiryDeleteAttemptsRef.current.delete(todo.id), 60_000)\n        })\n''',
    '''      const tombstone = {\n        ...todo,\n        dueDate: '1970-01-01',\n        dueTime: '',\n        updatedAt: Date.now(),\n      }\n      writeSharedTodo(profile, tombstone)\n        .then(() => deleteExpiredSharedTodo(profile, todo.id))\n        .catch((error) => {\n          console.error('Expired shared reminder delete failed:', error)\n          window.setTimeout(() => expiryDeleteAttemptsRef.current.delete(todo.id), 60_000)\n        })\n''',
)

# unread-indicators-v2.js: unread is now based on the same visible reminder set.
replace_once(
    'src/unread-indicators-v2.js',
    "import { classKeyFor, ensureSignedIn, readStudentProfile, studentKeyFor } from './school-sync'\n",
    "import { classKeyFor, ensureSignedIn, readStudentProfile, studentKeyFor } from './school-sync'\nimport { reminderActivityEligibleForStudent, reminderExpiryMs } from './reminder-lifecycle.js'\n",
)
replace_once(
    'src/unread-indicators-v2.js',
    '''    academic: new Map(),\n    seen: new Map(),\n''',
    '''    academic: new Map(),\n    seen: new Map(),\n    todoState: new Map(),\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    '''  let renderFrame = 0\n  const subscriptions = []\n''',
    '''  let renderFrame = 0\n  let reminderExpiryTimer = 0\n  const subscriptions = []\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    '''  function otherActivityVersion(entityType) {\n''',
    '''  function scheduleNextReminderExpiry() {\n    if (reminderExpiryTimer) {\n      window.clearTimeout(reminderExpiryTimer)\n      reminderExpiryTimer = 0\n    }\n    const nowMs = Date.now()\n    const nextExpiry = [...state.todos.values()]\n      .map(reminderExpiryMs)\n      .filter((value) => Number.isFinite(value) && value > nowMs)\n      .sort((a, b) => a - b)[0]\n    if (!nextExpiry) return\n    const delay = Math.max(20, Math.min(nextExpiry - nowMs + 20, 2_147_000_000))\n    reminderExpiryTimer = window.setTimeout(() => {\n      reminderExpiryTimer = 0\n      scheduleRender()\n    }, delay)\n  }\n\n  function otherActivityVersion(entityType) {\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    '''  function reminderActivity(todo) {\n    if (!todo?.id) return null\n    const activity = state.activity.get(`reminder:${todo.id}`)\n''',
    '''  function reminderActivity(todo) {\n    if (!todo?.id) return null\n    const personalState = state.todoState.get(String(todo.id)) || null\n    if (!reminderActivityEligibleForStudent(todo, personalState)) return null\n    const activity = state.activity.get(`reminder:${todo.id}`)\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    '''  function reminderRowUnread(todo) {\n''',
    '''  function latestReminderActivityVersion() {\n    let latest = 0\n    state.todos.forEach((todo) => {\n      latest = Math.max(latest, reminderActivityVersion(todo))\n    })\n    return latest\n  }\n\n  function reminderRowUnread(todo) {\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    '''      return otherActivityVersion('reminder') > Math.max(seenVersion(NAV_STATE_IDS.todo), baseline)\n        || hasUnreadReminderRow()\n''',
    '''      return latestReminderActivityVersion() > Math.max(seenVersion(NAV_STATE_IDS.todo), baseline)\n        || hasUnreadReminderRow()\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    "    writeSeen(REMINDER_ROW_BASELINE_ID, Math.max(1, otherActivityVersion('reminder')))\n",
    "    writeSeen(REMINDER_ROW_BASELINE_ID, Math.max(1, latestReminderActivityVersion()))\n",
)
replace_once(
    'src/unread-indicators-v2.js',
    "    if (tab === 'todo') writeSeen(NAV_STATE_IDS.todo, otherActivityVersion('reminder'))\n",
    "    if (tab === 'todo') writeSeen(NAV_STATE_IDS.todo, latestReminderActivityVersion())\n",
)
replace_once(
    'src/unread-indicators-v2.js',
    '''    renderReminderRows()\n    renderNav()\n    const tab = activeTab()\n''',
    '''    renderReminderRows()\n    renderNav()\n    scheduleNextReminderExpiry()\n    const tab = activeTab()\n''',
)
replace_once(
    'src/unread-indicators-v2.js',
    '''      next.set(item.id, {\n        id: item.id,\n        createdAt: Number(value.createdAt || 0),\n        updatedAt: Number(value.updatedAt || value.createdAt || 0),\n      })\n''',
    '''      next.set(item.id, {\n        id: item.id,\n        dueDate: String(value.dueDate || ''),\n        dueTime: String(value.dueTime || ''),\n        createdAt: Number(value.createdAt || 0),\n        updatedAt: Number(value.updatedAt || value.createdAt || 0),\n      })\n''',
)
old_seen_subscription = '''    const next = new Map()\n    snapshot.docs.forEach((item) => {\n      if (!item.id.startsWith(INTERNAL_PREFIX)) return\n      next.set(item.id, { updatedAt: Number(item.data()?.updatedAt || 0) })\n    })\n    pendingWrites.forEach((version, id) => {\n      if (Number(version || 0) > Number(next.get(id)?.updatedAt || 0)) {\n        next.set(id, { updatedAt: Number(version || 0) })\n      }\n    })\n    state.seen = next\n    state.seenReady = true\n    scheduleRender()\n'''
new_seen_subscription = '''    const nextSeen = new Map()\n    const nextTodoState = new Map()\n    snapshot.docs.forEach((item) => {\n      const value = item.data() || {}\n      if (item.id.startsWith(INTERNAL_PREFIX)) {\n        nextSeen.set(item.id, { updatedAt: Number(value.updatedAt || 0) })\n        return\n      }\n      nextTodoState.set(item.id, {\n        completed: Boolean(value.completed),\n        hidden: Boolean(value.hidden),\n        updatedAt: Number(value.updatedAt || 0),\n      })\n    })\n    pendingWrites.forEach((version, id) => {\n      if (Number(version || 0) > Number(nextSeen.get(id)?.updatedAt || 0)) {\n        nextSeen.set(id, { updatedAt: Number(version || 0) })\n      }\n    })\n    state.seen = nextSeen\n    state.todoState = nextTodoState\n    state.seenReady = true\n    scheduleRender()\n'''
replace_once('src/unread-indicators-v2.js', old_seen_subscription, new_seen_subscription)
replace_once(
    'src/unread-indicators-v2.js',
    '''    window.clearInterval(mealTimer)\n    if (renderFrame) window.cancelAnimationFrame(renderFrame)\n''',
    '''    window.clearInterval(mealTimer)\n    if (reminderExpiryTimer) window.clearTimeout(reminderExpiryTimer)\n    if (renderFrame) window.cancelAnimationFrame(renderFrame)\n''',
)

# Route reminder add/edit pushes to the auditable backend where hidden state is filtered.
replace_once(
    'src/push-client.js',
    "const PUSH_API_BASE = 'https://school-push-backend.vercel.app/api'\n",
    "const PUSH_API_BASE = 'https://school-push-backend.vercel.app/api'\nconst REMINDER_ACTIVITY_API_BASE = 'https://school-reminder-backend.vercel.app/api'\n",
)
replace_once(
    'src/push-client.js',
    '''    const idToken = await identity.user.getIdToken()\n    const response = await fetch(`${PUSH_API_BASE}/push-dispatch`, {\n''',
    '''    const idToken = await identity.user.getIdToken()\n    const dispatchUrl = event.entityType === 'reminder'\n      ? `${REMINDER_ACTIVITY_API_BASE}/activity-dispatch`\n      : `${PUSH_API_BASE}/push-dispatch`\n    const response = await fetch(dispatchUrl, {\n''',
)

# Backend helper: completed remains eligible for edit activity; hidden never is.
write('push-backend-v2/lib/activity-logic.js', textwrap.dedent(r'''\
export function reminderActivityRecipientEligible({ actorStudentKey, recipientStudentKey, state } = {}) {
  const actor = String(actorStudentKey || '')
  const recipient = String(recipientStudentKey || '')
  if (!recipient || recipient === actor) return false
  return state?.hidden !== true
}

function subjectParticle(name) {
  const text = String(name || '').trim()
  if (!text) return '가'
  const code = text.charCodeAt(text.length - 1)
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 === 0 ? '가' : '이'
  return '가'
}

export function reminderActivityBody({ actorName, action, title } = {}) {
  const actor = String(actorName || '').trim().slice(0, 20) || '친구'
  const cleanTitle = String(title || '').trim().slice(0, 80) || '리마인더'
  const verb = action === 'added' ? '추가했어' : '수정했어'
  return `${actor}${subjectParticle(actor)} ${cleanTitle} 리마인더를 ${verb}.`
}
'''))

write('push-backend-v2/lib/firebase-admin.js', textwrap.dedent(r'''\
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function parseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (parsed?.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n')
  if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) {
    throw new Error('Firebase service account is incomplete')
  }
  return parsed
}

function adminApp() {
  if (!getApps().length) {
    const serviceAccount = parseServiceAccount()
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
  }
  return getApps()[0]
}

export function adminDb() {
  return getFirestore(adminApp())
}

export function adminAuth() {
  return getAuth(adminApp())
}
'''))

write('push-backend-v2/api/activity-dispatch.js', textwrap.dedent(r'''\
import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import { reminderActivityBody, reminderActivityRecipientEligible } from '../lib/activity-logic.js'
import { sendPlan } from '../lib/push.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

function safeText(value, max = 120) {
  return String(value || '').trim().slice(0, max)
}

function subscriptionFromSnapshot(snapshot) {
  const data = snapshot.data() || {}
  const studentKey = safeText(data.studentKey, 80)
  const endpoint = safeText(data.endpoint, 2000)
  const p256dh = safeText(data.p256dh, 300)
  const auth = safeText(data.auth, 200)
  if (!studentKey || !endpoint || !p256dh || !auth) return null
  return {
    studentKey,
    endpoint,
    p256dh,
    auth,
    refPath: snapshot.ref.path,
  }
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const token = bearerToken(req)
  if (!token) return res.status(401).json({ ok: false, error: 'missing_auth' })

  try {
    const db = adminDb()
    const decoded = await adminAuth().verifyIdToken(token)
    const identitySnapshot = await db.collection('users').doc(decoded.uid).get()
    if (!identitySnapshot.exists) return res.status(403).json({ ok: false, error: 'identity_missing' })

    const identity = identitySnapshot.data() || {}
    const classId = safeText(identity.classId, 30)
    const actorStudentKey = safeText(identity.studentKey, 80)
    const actorName = safeText(identity.name, 20)
    if (!classId || !actorStudentKey || !actorName) {
      return res.status(403).json({ ok: false, error: 'identity_invalid' })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const entityType = safeText(body.entityType, 30)
    const entityId = safeText(body.entityId, 120)
    const sourceId = safeText(body.sourceId, 150)
    const action = body.action === 'added' ? 'added' : 'edited'
    const updatedAt = Number(body.updatedAt || 0)
    if (entityType !== 'reminder' || !entityId || !sourceId || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_event' })
    }

    const activitySnapshot = await db.collection('classes').doc(classId).collection('activity').doc(sourceId).get()
    if (!activitySnapshot.exists) return res.status(409).json({ ok: false, error: 'activity_missing' })
    const activity = activitySnapshot.data() || {}
    if (
      String(activity.entityType || '') !== 'reminder'
      || String(activity.entityId || '') !== entityId
      || String(activity.actorStudentKey || '') !== actorStudentKey
      || String(activity.action || '') !== action
      || Number(activity.updatedAt || 0) !== updatedAt
    ) {
      return res.status(409).json({ ok: false, error: 'activity_mismatch' })
    }

    const todoSnapshot = await db.collection('classes').doc(classId).collection('todos').doc(entityId).get()
    if (!todoSnapshot.exists) return res.status(200).json({ ok: true, attempted: 0, sent: 0, suppressedHidden: 0 })
    const todo = todoSnapshot.data() || {}

    const subscriptionsSnapshot = await db.collection('classes').doc(classId).collection('pushSubscriptions').get()
    const subscriptions = subscriptionsSnapshot.docs.map(subscriptionFromSnapshot).filter(Boolean)
    const recipientStudentKeys = [...new Set(subscriptions.map((item) => item.studentKey))]
      .filter((studentKey) => studentKey && studentKey !== actorStudentKey)

    const states = new Map()
    await Promise.all(recipientStudentKeys.map(async (studentKey) => {
      const stateSnapshot = await db.collection('students').doc(studentKey).collection('todoState').doc(entityId).get()
      states.set(studentKey, stateSnapshot.exists ? (stateSnapshot.data() || {}) : null)
    }))

    let suppressedHidden = 0
    const allowedStudents = new Set()
    for (const studentKey of recipientStudentKeys) {
      const state = states.get(studentKey) || null
      if (reminderActivityRecipientEligible({ actorStudentKey, recipientStudentKey: studentKey, state })) {
        allowedStudents.add(studentKey)
      } else if (state?.hidden === true) {
        suppressedHidden += 1
      }
    }

    const recipients = subscriptions.filter((subscription) => allowedStudents.has(subscription.studentKey))
    const summary = await sendPlan(db, {
      recipients,
      payload: {
        title: 'S-Hub',
        body: reminderActivityBody({ actorName, action, title: todo.title }),
        tag: `reminder-activity-${entityId}`,
        url: './?tab=todo',
      },
    })

    return res.status(200).json({ ok: true, suppressedHidden, ...summary })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) return res.status(401).json({ ok: false, error: 'invalid_auth' })
    console.error('activity-dispatch failed', error)
    return res.status(500).json({ ok: false, error: 'activity_dispatch_failed' })
  }
}
'''))

write('push-backend-v2/vercel.json', textwrap.dedent(r'''\
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/reminder-scheduled.js": {
      "maxDuration": 30
    },
    "api/activity-dispatch.js": {
      "maxDuration": 30
    }
  }
}
'''))

write('push-backend-v2/test/activity-logic.test.js', textwrap.dedent(r'''\
import test from 'node:test'
import assert from 'node:assert/strict'
import { reminderActivityRecipientEligible } from '../lib/activity-logic.js'

test('completed-only students still receive reminder edit activity', () => {
  assert.equal(reminderActivityRecipientEligible({
    actorStudentKey: 'student-a',
    recipientStudentKey: 'student-b',
    state: { completed: true, hidden: false },
  }), true)
})

test('hidden students never receive reminder edit activity', () => {
  assert.equal(reminderActivityRecipientEligible({
    actorStudentKey: 'student-a',
    recipientStudentKey: 'student-b',
    state: { completed: true, hidden: true },
  }), false)
})

test('the actor never receives their own reminder activity push', () => {
  assert.equal(reminderActivityRecipientEligible({
    actorStudentKey: 'student-a',
    recipientStudentKey: 'student-a',
    state: { completed: false, hidden: false },
  }), false)
})
'''))

write('tests/reminder-lifecycle.test.js', textwrap.dedent(r'''\
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isReminderExpired,
  reminderActivityEligibleForStudent,
  reminderExpiryMs,
} from '../src/reminder-lifecycle.js'

test('timed reminder expires at its exact KST due time', () => {
  const todo = { dueDate: '2026-08-27', dueTime: '17:00' }
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T16:59:59+09:00')), false)
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T17:00:00+09:00')), true)
})

test('untimed reminder expires at the end of its KST day', () => {
  const todo = { dueDate: '2026-08-27', dueTime: '' }
  assert.equal(reminderExpiryMs(todo), Date.parse('2026-08-27T23:59:59+09:00'))
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T23:59:58+09:00')), false)
  assert.equal(isReminderExpired(todo, Date.parse('2026-08-27T23:59:59+09:00')), true)
})

test('completed-only reminder remains eligible for friend edit dots', () => {
  const todo = { dueDate: '2026-08-28', dueTime: '17:00' }
  assert.equal(reminderActivityEligibleForStudent(
    todo,
    { completed: true, hidden: false },
    Date.parse('2026-08-27T18:00:00+09:00'),
  ), true)
})

test('hidden reminder is never eligible for friend edit dots', () => {
  const todo = { dueDate: '2026-08-28', dueTime: '17:00' }
  assert.equal(reminderActivityEligibleForStudent(
    todo,
    { completed: true, hidden: true },
    Date.parse('2026-08-27T18:00:00+09:00'),
  ), false)
})
'''))

# Make frontend regression tests part of the standard project command.
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text())
package.setdefault('scripts', {})['test'] = 'node --test tests/*.test.js'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

# Keep the repository rule source aligned with the due-time behavior. Runtime cleanup
# above is deliberately backward-compatible with the currently deployed day-end rule.
replace_once(
    'firestore.rules',
    '''        && request.resource.data.dueTime is string\n        && request.resource.data.dueTime.size() <= 5\n''',
    '''        && request.resource.data.dueTime is string\n        && (request.resource.data.dueTime == ''\n          || request.resource.data.dueTime.matches('^([01][0-9]|2[0-3]):[0-5][0-9]$'))\n''',
)
old_rule_expiry = '''    function reminderExpiredInKorea() {\n      let due = resource.data.dueDate;\n      let kstNow = request.time + duration.value(9, 'h');\n      let dueYear = int(due[0:4]);\n      let dueMonth = int(due[5:7]);\n      let dueDay = int(due[8:10]);\n      let datePassed = kstNow.year() > dueYear\n        || (kstNow.year() == dueYear && kstNow.month() > dueMonth)\n        || (kstNow.year() == dueYear && kstNow.month() == dueMonth && kstNow.day() > dueDay);\n      let finalSecond = kstNow.year() == dueYear\n        && kstNow.month() == dueMonth\n        && kstNow.day() == dueDay\n        && kstNow.hours() == 23\n        && kstNow.minutes() == 59\n        && kstNow.seconds() >= 59;\n      return due is string\n        && due.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')\n        && (datePassed || finalSecond);\n    }\n'''
new_rule_expiry = '''    function reminderExpiredInKorea() {\n      let due = resource.data.dueDate;\n      let dueTime = resource.data.dueTime;\n      let kstNow = request.time + duration.value(9, 'h');\n      let dueYear = int(due[0:4]);\n      let dueMonth = int(due[5:7]);\n      let dueDay = int(due[8:10]);\n      let sameDay = kstNow.year() == dueYear\n        && kstNow.month() == dueMonth\n        && kstNow.day() == dueDay;\n      let datePassed = kstNow.year() > dueYear\n        || (kstNow.year() == dueYear && kstNow.month() > dueMonth)\n        || (kstNow.year() == dueYear && kstNow.month() == dueMonth && kstNow.day() > dueDay);\n      let untimedExpired = dueTime == ''\n        && sameDay\n        && kstNow.hours() == 23\n        && kstNow.minutes() == 59\n        && kstNow.seconds() >= 59;\n      let timed = dueTime is string\n        && dueTime.matches('^([01][0-9]|2[0-3]):[0-5][0-9]$');\n      let timedExpired = timed\n        && sameDay\n        && (kstNow.hours() > int(dueTime[0:2])\n          || (kstNow.hours() == int(dueTime[0:2])\n            && kstNow.minutes() >= int(dueTime[3:5])));\n      return due is string\n        && due.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')\n        && (datePassed || untimedExpired || timedExpired);\n    }\n'''
replace_once('firestore.rules', old_rule_expiry, new_rule_expiry)

# Document the exact activity semantics next to the scheduled backend.
readme = read('push-backend-v2/README.md')
marker = '## Endpoint\n'
addition = '''## Reminder edit activity endpoint\n\n`POST /api/activity-dispatch` handles class reminder add/edit pushes. It verifies the actor against Firebase activity data, sends to the other students in the class, keeps `completed=true` students subscribed to edit activity, and suppresses every device for students whose personal reminder state has `hidden=true`.\n\n'''
if addition not in readme:
    if marker not in readme:
        raise SystemExit('push-backend-v2/README.md: endpoint marker missing')
    readme = readme.replace(marker, addition + marker, 1)
    write('push-backend-v2/README.md', readme)

# The bootstrap files were only needed to apply this one guarded patch. Remove them
# in the resulting commit so we do not add more dormant patch machinery.
for cleanup in [
    '.github/scripts/stabilize_reminder_lifecycle.py',
    '.github/workflows/stabilize-reminder-lifecycle.yml',
]:
    target = ROOT / cleanup
    if target.exists():
        target.unlink()
