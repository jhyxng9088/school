import { useCallback, useEffect, useRef, useState } from 'react'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
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

function safeSharedTodo(todo) {
  if (!todo || typeof todo !== 'object') return null
  const id = String(todo.id || '')
  const title = String(todo.title || '').trim().slice(0, 80)
  const dueDate = String(todo.dueDate || '')
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null
  const type = ['task', 'performance', 'exam', 'material'].includes(todo.type) ? todo.type : 'task'
  const dueTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(todo.dueTime || '')) ? String(todo.dueTime) : ''
  return {
    id,
    type,
    title,
    dueDate,
    dueTime,
    createdAt: Number(todo.createdAt || Date.now()),
    updatedAt: Number(todo.updatedAt || todo.createdAt || Date.now()),
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
