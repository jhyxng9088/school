import { useCallback, useEffect, useRef, useState } from 'react'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from 'firebase/auth'
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import {
  loadOverrides,
  loadWeeklySchedule,
  normalizeOverrides,
  normalizeWeeklySchedule,
  pruneExpiredOverrides,
  saveOverrides,
  saveWeeklySchedule,
} from './timetable'

const firebaseConfig = {
  apiKey: 'AIzaSyD4F5hQItDGTGItXJ2vnuu7ExM1LBLn9E0',
  authDomain: 'school-adeda.firebaseapp.com',
  projectId: 'school-adeda',
  storageBucket: 'school-adeda.firebasestorage.app',
  messagingSenderId: '321702677113',
  appId: '1:321702677113:web:390c5d63e3d93ec17f22a8',
  measurementId: 'G-PFCP63TWQS',
}

export const STUDENT_PROFILE_KEY = 'school.studentProfile.v1'
const MIGRATION_VERSION = 'v1'

const SUMMARY_MAX_SECTIONS = 14
const SUMMARY_MAX_ITEMS = 16
const ATTACHMENT_MAX_BYTES = 2_500_000
const ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'text/rtf',
  'text/html',
  'text/xml',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
])

function safeSummary(value) {
  if (!value || typeof value !== 'object') return null
  const overview = String(value.overview || '').trim().slice(0, 2400)
  const sections = Array.isArray(value.sections)
    ? value.sections.slice(0, SUMMARY_MAX_SECTIONS).map((section) => ({
        heading: String(section?.heading || '').trim().slice(0, 80),
        items: Array.isArray(section?.items)
          ? section.items.slice(0, SUMMARY_MAX_ITEMS).map((item) => String(item || '').trim().slice(0, 700)).filter(Boolean)
          : [],
      })).filter((section) => section.heading && section.items.length)
    : []
  if (!overview && !sections.length) return null
  return { overview, sections }
}

function safeAttachment(value) {
  if (!value || typeof value !== 'object') return null
  const name = String(value.name || '').trim().slice(0, 120)
  const mimeType = String(value.mimeType || '').trim().toLowerCase()
  const size = Number(value.size || 0)
  if (!name || !ATTACHMENT_MIME_TYPES.has(mimeType)) return null
  if (!Number.isInteger(size) || size <= 0 || size > ATTACHMENT_MAX_BYTES) return null
  return { name, mimeType, size }
}

const PRESENCE_ACTIVE_MS = 150 * 1000
const PRESENCE_REFRESH_MS = 60 * 1000

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 20)
}

export function normalizeStudentProfile(value) {
  if (!value || typeof value !== 'object') return null
  const name = normalizeName(value.name)
  const classNumber = Number(value.classNumber)
  const studentNumber = Number(value.studentNumber)
  if (!name) return null
  if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 30) return null
  if (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 60) return null
  return { name, classNumber, studentNumber }
}

export function readStudentProfile() {
  try {
    return normalizeStudentProfile(JSON.parse(localStorage.getItem(STUDENT_PROFILE_KEY) || 'null'))
  } catch {
    return null
  }
}

export function saveStudentProfile(value) {
  const profile = normalizeStudentProfile(value)
  if (!profile) return null
  localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(profile))
  return profile
}

function hash32(value, seed) {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
    hash ^= hash >>> 13
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function profileIdentity(profile) {
  const normalized = normalizeStudentProfile(profile)
  if (!normalized) return ''
  const compactName = normalized.name.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
  return `${normalized.classNumber}|${normalized.studentNumber}|${compactName}`
}

export function classKeyFor(profile) {
  const normalized = normalizeStudentProfile(profile)
  return normalized ? `class-${normalized.classNumber}` : ''
}

export function studentKeyFor(profile) {
  const identity = profileIdentity(profile)
  if (!identity) return ''
  return `student-${hash32(identity, 2166136261)}${hash32(identity, 2246822519)}`
}

export function profileSignature(profile) {
  const normalized = normalizeStudentProfile(profile)
  return normalized ? `${normalized.classNumber}:${normalized.studentNumber}:${normalized.name}` : ''
}

const syncApp = getApps().some((app) => app.name === 'school-sync')
  ? getApp('school-sync')
  : initializeApp(firebaseConfig, 'school-sync')
const auth = getAuth(syncApp)
const db = getFirestore(syncApp)

let authPromise = null

async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser
  if (!authPromise) {
    authPromise = (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence)
      } catch {
        // The session can still work when persistent auth storage is unavailable.
      }
      const credential = await signInAnonymously(auth)
      return credential.user
    })().catch((error) => {
      authPromise = null
      throw error
    })
  }
  return authPromise
}

function classTodosCollection(profile) {
  return collection(db, 'classes', classKeyFor(profile), 'todos')
}

function classTodoRef(profile, todoId) {
  return doc(db, 'classes', classKeyFor(profile), 'todos', String(todoId))
}

function personalTodoStateCollection(profile) {
  return collection(db, 'students', studentKeyFor(profile), 'todoState')
}

function personalTodoStateRef(profile, todoId) {
  return doc(db, 'students', studentKeyFor(profile), 'todoState', String(todoId))
}

function timetableRef(profile) {
  return doc(db, 'classes', classKeyFor(profile), 'settings', 'timetable')
}

function classMembersCollection(profile) {
  return collection(db, 'classes', classKeyFor(profile), 'members')
}

function classMemberRef(profile) {
  return doc(db, 'classes', classKeyFor(profile), 'members', studentKeyFor(profile))
}

function classPresenceCollection(profile) {
  return collection(db, 'classes', classKeyFor(profile), 'presence')
}

function classPresenceRef(profile) {
  return doc(db, 'classes', classKeyFor(profile), 'presence', studentKeyFor(profile))
}

function safeSharedTodo(todo) {
  if (!todo || typeof todo !== 'object') return null
  const id = String(todo.id || '')
  const title = String(todo.title || '').trim().slice(0, 80)
  const dueDate = String(todo.dueDate || '')
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null
  const type = ['task', 'performance', 'exam', 'material'].includes(todo.type) ? todo.type : 'task'
  const dueTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(todo.dueTime || '')) ? String(todo.dueTime) : ''
  const summary = safeSummary(todo.summary)
  const attachment = safeAttachment(todo.attachment)
  return {
    id,
    type,
    title,
    dueDate,
    dueTime,
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
    ...(summary ? { summary } : {}),
    ...(attachment ? { attachment } : {}),
  }
}

export function listenClassTodos(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(
        classTodosCollection(profile),
        (snapshot) => {
          const todos = snapshot.docs
            .map((item) => safeSharedTodo({ id: item.id, ...item.data() }))
            .filter(Boolean)
          onValue(todos)
        },
        onError,
      )
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
  }
}

export function listenStudentTodoState(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(
        personalTodoStateCollection(profile),
        (snapshot) => {
          const state = {}
          snapshot.docs.forEach((item) => {
            const value = item.data() || {}
            state[item.id] = {
              completed: Boolean(value.completed),
              hidden: Boolean(value.hidden),
              updatedAt: Number(value.updatedAt || 0),
            }
          })
          onValue(state)
        },
        onError,
      )
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
  }
}

export function useClassPresence(profile) {
  const signature = profileSignature(profile)
  const [counts, setCounts] = useState({ online: 0, total: 0 })

  useEffect(() => {
    if (!signature) return undefined

    let stopped = false
    let refreshTimer = null

    const heartbeat = async () => {
      if (stopped || document.hidden) return
      await ensureSignedIn()
      if (stopped) return
      const studentKey = studentKeyFor(profile)
      await setDoc(classPresenceRef(profile), {
        studentKey,
        lastSeenMs: Date.now(),
      })
    }

    const recount = async () => {
      if (stopped) return
      await ensureSignedIn()
      if (stopped) return
      const threshold = Date.now() - PRESENCE_ACTIVE_MS
      const [memberSnapshot, onlineSnapshot] = await Promise.all([
        getCountFromServer(classMembersCollection(profile)),
        getCountFromServer(query(
          classPresenceCollection(profile),
          where('lastSeenMs', '>=', threshold),
        )),
      ])
      if (stopped) return
      setCounts({
        online: onlineSnapshot.data().count,
        total: memberSnapshot.data().count,
      })
    }

    const refreshPresence = async () => {
      if (stopped || document.hidden) return
      try {
        await heartbeat()
        await recount()
      } catch (error) {
        console.error('Class presence refresh failed:', error)
      }
    }

    const handleVisibility = () => {
      if (!document.hidden) refreshPresence()
    }

    ensureSignedIn()
      .then(async () => {
        if (stopped) return
        const member = classMemberRef(profile)
        const existing = await getDoc(member)
        if (!existing.exists()) {
          await setDoc(member, { joinedAt: Date.now() })
        }
        if (stopped) return

        await refreshPresence()
        if (stopped) return
        refreshTimer = window.setInterval(refreshPresence, PRESENCE_REFRESH_MS)
        document.addEventListener('visibilitychange', handleVisibility)
        window.addEventListener('focus', refreshPresence)
      })
      .catch((error) => console.error('Class presence connection failed:', error))

    return () => {
      stopped = true
      if (refreshTimer) window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', refreshPresence)
    }
  }, [signature])

  return counts
}

export async function writeSharedTodo(profile, todo) {
  const normalized = safeSharedTodo(todo)
  if (!normalized) throw new Error('Invalid shared reminder')
  await ensureSignedIn()
  await setDoc(classTodoRef(profile, normalized.id), normalized, { merge: true })
}

export async function writeStudentTodoState(profile, todoId, state) {
  await ensureSignedIn()
  await setDoc(personalTodoStateRef(profile, todoId), {
    completed: Boolean(state?.completed),
    hidden: Boolean(state?.hidden),
    updatedAt: Date.now(),
  }, { merge: true })
}

export async function migrateLegacyTodos(profile, legacyTodos) {
  const classKey = classKeyFor(profile)
  const studentKey = studentKeyFor(profile)
  if (!classKey || !studentKey) return
  const marker = `school.cloudMigration.${MIGRATION_VERSION}.${classKey}.${studentKey}`
  if (localStorage.getItem(marker) === 'done') return

  await ensureSignedIn()
  const validTodos = Array.isArray(legacyTodos) ? legacyTodos : []
  for (const legacy of validTodos) {
    const shared = safeSharedTodo({ ...legacy, completed: undefined })
    if (!shared) continue
    const target = classTodoRef(profile, shared.id)
    const existing = await getDoc(target)
    if (!existing.exists()) await setDoc(target, shared)
    if (legacy.completed) {
      await setDoc(personalTodoStateRef(profile, shared.id), {
        completed: true,
        hidden: false,
        updatedAt: Date.now(),
      }, { merge: true })
    }
  }

  localStorage.setItem(marker, 'done')
}

async function writeInitialTimetable(profile, value) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(value.weeklySchedule),
    overrides: pruneExpiredOverrides(value.overrides || {}),
    updatedAt: Date.now(),
  })
}

async function writeWeeklyScheduleCloud(profile, weeklySchedule) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    weeklySchedule: normalizeWeeklySchedule(weeklySchedule),
    updatedAt: Date.now(),
  }, { merge: true })
}

async function writeOverridesCloud(profile, overrides) {
  await ensureSignedIn()
  await setDoc(timetableRef(profile), {
    overrides: pruneExpiredOverrides(overrides || {}),
    updatedAt: Date.now(),
  }, { merge: true })
}

export function useSharedTimetable(profile, now) {
  const initialWeeklyRef = useRef(null)
  const initialOverridesRef = useRef(null)
  if (initialWeeklyRef.current === null) initialWeeklyRef.current = loadWeeklySchedule()
  if (initialOverridesRef.current === null) initialOverridesRef.current = loadOverrides()

  const [weeklySchedule, setWeeklySchedule] = useState(initialWeeklyRef.current)
  const [overrides, setOverrides] = useState(initialOverridesRef.current)
  const signature = profileSignature(profile)

  useEffect(() => {
    if (!signature) return undefined
    let stopped = false
    let unsubscribe = () => {}

    ensureSignedIn()
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          timetableRef(profile),
          (snapshot) => {
            if (!snapshot.exists()) {
              writeInitialTimetable(profile, {
                weeklySchedule: initialWeeklyRef.current,
                overrides: initialOverridesRef.current,
              }).catch((error) => console.error('Initial timetable sync failed:', error))
              return
            }

            const data = snapshot.data() || {}
            const nextWeekly = normalizeWeeklySchedule(data.weeklySchedule)
            const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data.overrides), new Date())
            saveWeeklySchedule(nextWeekly)
            saveOverrides(nextOverrides)
            setWeeklySchedule(nextWeekly)
            setOverrides(nextOverrides)
          },
          (error) => console.error('Timetable realtime sync failed:', error),
        )
      })
      .catch((error) => console.error('Timetable cloud connection failed:', error))

    return () => {
      stopped = true
      unsubscribe()
    }
  }, [signature])

  const commitWeeklySchedule = useCallback((nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    saveWeeklySchedule(normalized)
    setWeeklySchedule(normalized)
    writeWeeklyScheduleCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable save failed:', error))
  }, [signature])

  const commitOverrides = useCallback((nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    saveOverrides(normalized)
    setOverrides(normalized)
    writeOverridesCloud(profile, normalized)
      .catch((error) => console.error('Shared timetable override save failed:', error))
  }, [signature, now])

  return {
    weeklySchedule,
    overrides,
    commitWeeklySchedule,
    commitOverrides,
  }
}
