import { useCallback, useEffect, useState } from 'react'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  initializeFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
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
import { isReminderTypeId, normalizeReminderCategory, normalizeReminderCategories } from './reminder-categories.js'

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
const CLIENT_DATA_GENERATION_KEY = 'school.clientDataGeneration'
const CLIENT_DATA_GENERATION = '2'
const MIGRATION_VERSION = 'v1'

const SUMMARY_MAX_SECTIONS = 14
const SUMMARY_MAX_ITEMS = 16
const ATTACHMENT_MAX_BYTES = 2_500_000
const ORIGINAL_ATTACHMENT_MAX_BYTES = 8_000_000
const ORIGINAL_ATTACHMENT_CHUNK_CHARS = 600_000
const ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX = 10
const REMINDER_ORIGINAL_API_URL = 'https://school-reminder-backend.vercel.app/api/reminder-original'
const ORIGINAL_ATTACHMENT_SERVER_TIMEOUT_MS = 14_000
const PERSONAL_TIMETABLE_API_URL = 'https://school-reminder-backend.vercel.app/api/personal-timetable'
const originalAttachmentMemoryCache = new Map()
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

const PRESENCE_ACTIVE_MS = 45 * 1000
const PRESENCE_REFRESH_MS = 15 * 1000

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
  try {
    window.dispatchEvent(new CustomEvent('school:student-profile-saved', { detail: profile }))
  } catch {
    // The stored profile remains authoritative if custom events are unavailable.
  }
  return profile
}


export function prepareClientDataGeneration() {
  try {
    const stored = localStorage.getItem(CLIENT_DATA_GENERATION_KEY)
    const existingSchoolKeys = Object.keys(localStorage).filter((key) => key.startsWith('school.'))
    const hasLegacySchoolData = existingSchoolKeys.some((key) => (
      key !== CLIENT_DATA_GENERATION_KEY && key !== 'school.installGuideDone'
    ))

    if (stored === CLIENT_DATA_GENERATION) return false
    if (!stored && !hasLegacySchoolData) {
      localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
      return false
    }

    const installDone = localStorage.getItem('school.installGuideDone')
    existingSchoolKeys.forEach((key) => localStorage.removeItem(key))
    if (installDone !== null) localStorage.setItem('school.installGuideDone', installDone)
    localStorage.setItem(CLIENT_DATA_GENERATION_KEY, CLIENT_DATA_GENERATION)
    return true
  } catch {
    return false
  }
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
const samsungInternet = /SamsungBrowser/i.test(navigator.userAgent)
const db = initializeFirestore(syncApp, samsungInternet
  ? { experimentalForceLongPolling: true }
  : { experimentalAutoDetectLongPolling: true })

let authPromise = null
const identitySyncPromises = new Map()

async function ensureStoredProfileIdentity(user) {
  const profile = readStudentProfile()
  if (!profile || !user?.uid) return user

  const classId = classKeyFor(profile)
  const studentKey = studentKeyFor(profile)
  const signature = profileSignature(profile)
  if (!classId || !studentKey || !signature) return user

  const cacheKey = `${user.uid}|${signature}`
  if (!identitySyncPromises.has(cacheKey)) {
    const pending = (async () => {
      const identity = doc(db, 'users', user.uid)
      const snapshot = await getDoc(identity)

      if (!snapshot.exists()) {
        const now = Date.now()
        await setDoc(identity, {
          classId,
          studentKey,
          name: profile.name,
          createdAt: now,
          updatedAt: now,
        })
        return user
      }

      const existing = snapshot.data() || {}
      if (
        String(existing.classId || '') !== classId
        || String(existing.studentKey || '') !== studentKey
        || String(existing.name || '') !== profile.name
      ) {
        throw new Error('저장된 학생 정보와 로그인 정보가 달라. 앱 데이터를 초기화한 뒤 다시 등록해줘.')
      }
      return user
    })().catch((error) => {
      identitySyncPromises.delete(cacheKey)
      throw error
    })
    identitySyncPromises.set(cacheKey, pending)
  }

  await identitySyncPromises.get(cacheKey)
  return user
}

export async function ensureSignedIn() {
  let user = auth.currentUser
  if (!user) {
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
    user = await authPromise
  }
  return ensureStoredProfileIdentity(user)
}

function installServerRevalidation(refresh) {
  const handle = () => {
    if (!document.hidden) refresh()
  }
  document.addEventListener('visibilitychange', handle)
  window.addEventListener('focus', handle)
  window.addEventListener('online', handle)
  return () => {
    document.removeEventListener('visibilitychange', handle)
    window.removeEventListener('focus', handle)
    window.removeEventListener('online', handle)
  }
}

function classTodosCollection(profile) {
  return collection(db, 'classes', classKeyFor(profile), 'todos')
}

function classTodoRef(profile, todoId) {
  return doc(db, 'classes', classKeyFor(profile), 'todos', String(todoId))
}

function classReminderCategoriesCollection(profile) {
  return collection(db, 'classes', classKeyFor(profile), 'reminderCategories')
}

function classReminderCategoryRef(profile, categoryId) {
  return doc(db, 'classes', classKeyFor(profile), 'reminderCategories', String(categoryId))
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

function safeOriginalTodoId(todoId) {
  return String(todoId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
}

function originalAttachmentRef(profile, todoId) {
  return doc(db, 'classes', classKeyFor(profile), 'originalAttachments', safeOriginalTodoId(todoId))
}

function originalAttachmentChunkRef(profile, todoId, index) {
  return doc(
    db,
    'classes',
    classKeyFor(profile),
    'originalAttachments',
    safeOriginalTodoId(todoId),
    'chunks',
    String(index).padStart(3, '0'),
  )
}

function inferredOriginalMimeType(file) {
  const explicit = String(file?.type || '').trim().toLowerCase()
  if (ATTACHMENT_MIME_TYPES.has(explicit)) return explicit
  const name = String(file?.name || '').toLowerCase()
  const extensionMap = [
    ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],
    ['.webp', 'image/webp'], ['.bmp', 'image/bmp'], ['.heic', 'image/heic'],
    ['.heif', 'image/heif'], ['.pdf', 'application/pdf'], ['.json', 'application/json'],
    ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.rtf', 'text/rtf'],
    ['.html', 'text/html'], ['.htm', 'text/html'], ['.xml', 'text/xml'],
  ]
  return extensionMap.find(([extension]) => name.endsWith(extension))?.[1] || ''
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error('원본 파일을 변환할 수 없어.'))
      else resolve(value.slice(comma + 1))
    }
    reader.onerror = () => reject(new Error('원본 파일을 읽을 수 없어.'))
    reader.readAsDataURL(file)
  })
}

export async function writeReminderOriginal(profile, todoId, file) {
  const safeId = safeOriginalTodoId(todoId)
  if (!safeId || !(file instanceof Blob)) throw new Error('원본 파일을 저장할 수 없어.')
  const size = Number(file.size || 0)
  if (!Number.isInteger(size) || size <= 0) throw new Error('원본 파일이 비어 있어.')
  if (size > ORIGINAL_ATTACHMENT_MAX_BYTES) {
    throw new Error('원본 사진 저장은 8MB 이하 파일을 지원해.')
  }
  const mimeType = inferredOriginalMimeType(file)
  if (!ATTACHMENT_MIME_TYPES.has(mimeType)) throw new Error('이 파일 형식은 원본 저장을 지원하지 않아.')

  await ensureSignedIn()
  const dataBase64 = await fileToBase64(file)
  const chunks = []
  for (let offset = 0; offset < dataBase64.length; offset += ORIGINAL_ATTACHMENT_CHUNK_CHARS) {
    chunks.push(dataBase64.slice(offset, offset + ORIGINAL_ATTACHMENT_CHUNK_CHARS))
  }
  if (!chunks.length || chunks.length > 24) throw new Error('원본 파일을 저장 가능한 크기로 나눌 수 없어.')

  // Keep each Firestore commit comfortably below the 10 MiB request limit.
  // Metadata is written last so readers never see a partially uploaded original.
  const chunksPerBatch = 8
  for (let start = 0; start < chunks.length; start += chunksPerBatch) {
    const batch = writeBatch(db)
    chunks.slice(start, start + chunksPerBatch).forEach((data, offset) => {
      batch.set(originalAttachmentChunkRef(profile, safeId, start + offset), { data })
    })
    await batch.commit()
  }

  await setDoc(originalAttachmentRef(profile, safeId), {
    name: String(file.name || '원본 파일').slice(0, 120),
    mimeType,
    size,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  })
  originalAttachmentMemoryCache.delete(`${classKeyFor(profile)}:${safeId}`)
}

async function getReminderOriginalFromServer(safeId) {
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  if (!idToken) throw new Error('로그인 정보를 확인하지 못했어.')
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), ORIGINAL_ATTACHMENT_SERVER_TIMEOUT_MS)
  try {
    const response = await fetch(`${REMINDER_ORIGINAL_API_URL}?id=${encodeURIComponent(safeId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      let payload = null
      try { payload = await response.json() } catch { payload = null }
      const error = new Error(String(payload?.message || '원본 사진을 불러오지 못했어.'))
      error.status = response.status
      error.code = String(payload?.error || `school-sync/original-http-${response.status}`)
      if (response.status === 404) {
        error.code = 'school-sync/original-not-found'
        error.message = '이 리마인더는 원본 저장 기능 적용 전에 만들어졌거나 원본이 없어.'
      }
      throw error
    }
    const blob = await response.blob()
    if (!blob.size || blob.size > ORIGINAL_ATTACHMENT_MAX_BYTES) throw new Error('원본 파일 정보가 올바르지 않아.')
    const rawName = String(response.headers.get('x-file-name') || '')
    let name = '원본 사진'
    if (rawName) {
      try { name = decodeURIComponent(rawName).slice(0, 120) || name } catch { name = rawName.slice(0, 120) || name }
    }
    return {
      name,
      mimeType: String(response.headers.get('content-type') || blob.type || 'application/octet-stream').split(';')[0],
      size: blob.size,
      blob,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('원본 사진 서버 응답이 늦어 기존 방식으로 다시 불러올게.')
      timeout.code = 'school-sync/original-server-timeout'
      throw timeout
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function getReminderOriginalFromFirestore(profile, safeId) {
  await ensureSignedIn()
  const metadataSnapshot = await getDoc(originalAttachmentRef(profile, safeId))
  if (!metadataSnapshot.exists()) {
    const error = new Error('이 리마인더는 원본 저장 기능 적용 전에 만들어져서 원본이 없어. 사진을 다시 올려줘.')
    error.code = 'school-sync/original-not-found'
    throw error
  }
  const metadata = metadataSnapshot.data() || {}
  const chunkCount = Number(metadata.chunkCount || 0)
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 24) throw new Error('원본 파일 정보가 올바르지 않아.')
  const chunkSnapshot = await getDocs(collection(originalAttachmentRef(profile, safeId), 'chunks'))
  const chunkDocs = [...chunkSnapshot.docs].sort((a, b) => a.id.localeCompare(b.id))
  if (chunkDocs.length !== chunkCount) throw new Error('원본 파일 일부를 불러오지 못했어.')
  return {
    name: String(metadata.name || '원본 사진').slice(0, 120),
    mimeType: String(metadata.mimeType || 'application/octet-stream'),
    size: Number(metadata.size || 0),
    dataBase64: chunkDocs.map((snapshot) => String(snapshot.data()?.data || '')).join(''),
  }
}

export async function getReminderOriginal(profile, todoId) {
  const safeId = safeOriginalTodoId(todoId)
  if (!safeId) throw new Error('원본 파일을 찾을 수 없어.')
  const cacheKey = `${classKeyFor(profile)}:${safeId}`
  const cached = originalAttachmentMemoryCache.get(cacheKey)
  if (cached) return cached

  const request = (async () => {
    try {
      return await getReminderOriginalFromServer(safeId)
    } catch (error) {
      if (error?.code === 'school-sync/original-not-found') throw error
      console.warn('Fast reminder original route unavailable; falling back to Firestore.', error)
      return getReminderOriginalFromFirestore(profile, safeId)
    }
  })()

  originalAttachmentMemoryCache.set(cacheKey, request)
  while (originalAttachmentMemoryCache.size > ORIGINAL_ATTACHMENT_MEMORY_CACHE_MAX) {
    const oldestKey = originalAttachmentMemoryCache.keys().next().value
    if (!oldestKey) break
    originalAttachmentMemoryCache.delete(oldestKey)
  }
  try {
    return await request
  } catch (error) {
    if (originalAttachmentMemoryCache.get(cacheKey) === request) originalAttachmentMemoryCache.delete(cacheKey)
    throw error
  }
}

function safeSharedTodo(todo) {
  if (!todo || typeof todo !== 'object') return null
  const id = String(todo.id || '')
  const title = String(todo.title || '').trim().slice(0, 80)
  const dueDate = String(todo.dueDate || '')
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null
  const type = isReminderTypeId(todo.type) ? todo.type : 'task'
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

function sharedTodosFromSnapshot(snapshot) {
  return snapshot.docs
    .map((item) => safeSharedTodo({ id: item.id, ...item.data() }))
    .filter(Boolean)
}

export function listenClassTodos(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  let removeRevalidation = () => {}
  let generation = 0

  const applySnapshot = (snapshot) => {
    if (stopped || snapshot.metadata?.fromCache) return
    generation += 1
    onValue(sharedTodosFromSnapshot(snapshot))
  }

  const refreshFromServer = async () => {
    const startedAtGeneration = generation
    try {
      const snapshot = await getDocsFromServer(classTodosCollection(profile))
      if (stopped || generation !== startedAtGeneration) return
      applySnapshot(snapshot)
    } catch (error) {
      if (!stopped) onError(error)
    }
  }

  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(classTodosCollection(profile), applySnapshot, onError)
      removeRevalidation = installServerRevalidation(refreshFromServer)
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
    removeRevalidation()
  }
}

export function listenClassReminderCategories(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  let removeRevalidation = () => {}
  let generation = 0

  const applySnapshot = (snapshot) => {
    if (stopped || snapshot.metadata?.fromCache) return
    generation += 1
    onValue(normalizeReminderCategories(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
  }

  const refreshFromServer = async () => {
    const startedAtGeneration = generation
    try {
      const snapshot = await getDocsFromServer(classReminderCategoriesCollection(profile))
      if (stopped || generation !== startedAtGeneration) return
      applySnapshot(snapshot)
    } catch (error) {
      if (!stopped) onError(error)
    }
  }

  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(classReminderCategoriesCollection(profile), applySnapshot, onError)
      removeRevalidation = installServerRevalidation(refreshFromServer)
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
    removeRevalidation()
  }
}

function personalTodoStateFromSnapshot(snapshot) {
  const state = {}
  snapshot.docs.forEach((item) => {
    const value = item.data() || {}
    state[item.id] = {
      completed: Boolean(value.completed),
      hidden: Boolean(value.hidden),
      updatedAt: Number(value.updatedAt || 0),
    }
  })
  return state
}

export function listenStudentTodoState(profile, onValue, onError = () => {}) {
  let stopped = false
  let unsubscribe = () => {}
  let removeRevalidation = () => {}
  let generation = 0

  const applySnapshot = (snapshot) => {
    if (stopped || snapshot.metadata?.fromCache) return
    generation += 1
    onValue(personalTodoStateFromSnapshot(snapshot))
  }

  const refreshFromServer = async () => {
    const startedAtGeneration = generation
    try {
      const snapshot = await getDocsFromServer(personalTodoStateCollection(profile))
      if (stopped || generation !== startedAtGeneration) return
      applySnapshot(snapshot)
    } catch (error) {
      if (!stopped) onError(error)
    }
  }

  ensureSignedIn()
    .then(() => {
      if (stopped) return
      unsubscribe = onSnapshot(personalTodoStateCollection(profile), applySnapshot, onError)
      removeRevalidation = installServerRevalidation(refreshFromServer)
    })
    .catch(onError)

  return () => {
    stopped = true
    unsubscribe()
    removeRevalidation()
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

export async function writeClassReminderCategory(profile, value) {
  const category = normalizeReminderCategory(value)
  if (!category) throw new Error('Invalid reminder category')
  await ensureSignedIn()
  await setDoc(classReminderCategoryRef(profile, category.id), category)
  return category
}


export async function deleteExpiredSharedTodo(profile, todoId) {
  const id = String(todoId || '').trim()
  if (!id) return false
  await ensureSignedIn()
  await deleteDoc(classTodoRef(profile, id))
  return true
}

export async function writeStudentTodoState(profile, todoId, state) {
  await ensureSignedIn()
  await setDoc(personalTodoStateRef(profile, todoId), {
    completed: Boolean(state?.completed),
    hidden: Boolean(state?.hidden),
    updatedAt: Number(state?.updatedAt || Date.now()),
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

function movingClassEnabled(profile) {
  const classNumber = Number(profile?.classNumber)
  return Number.isInteger(classNumber) && classNumber >= 7 && classNumber <= 15
}

function personalTimetableCacheKey(profile, kind) {
  const studentKey = studentKeyFor(profile)
  return studentKey ? `school.timetable.personal.${kind}.v1.${studentKey}` : ''
}

function readPersonalTimetableCache(profile, kind) {
  const key = personalTimetableCacheKey(profile, kind)
  if (!key) return null
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function loadPersonalWeeklyScheduleCache(profile) {
  return normalizeWeeklySchedule(readPersonalTimetableCache(profile, 'weekly'))
}

function loadPersonalOverridesCache(profile, now = new Date()) {
  return pruneExpiredOverrides(normalizeOverrides(readPersonalTimetableCache(profile, 'overrides')), now)
}

function savePersonalWeeklyScheduleCache(profile, schedule) {
  const key = personalTimetableCacheKey(profile, 'weekly')
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(normalizeWeeklySchedule(schedule)))
  } catch {
    // Server state remains authoritative when local storage is unavailable.
  }
}

function savePersonalOverridesCache(profile, overrides) {
  const key = personalTimetableCacheKey(profile, 'overrides')
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(pruneExpiredOverrides(overrides || {})))
  } catch {
    // Server state remains authoritative when local storage is unavailable.
  }
}

function mergeWeeklyTimetables(sharedSchedule, personalSchedule) {
  const shared = normalizeWeeklySchedule(sharedSchedule)
  const personal = normalizeWeeklySchedule(personalSchedule)
  const merged = normalizeWeeklySchedule(shared)
  for (const [dayId, periods] of Object.entries(personal)) {
    for (const [period, subject] of Object.entries(periods)) {
      if (String(subject || '').trim()) merged[dayId][period] = subject
    }
  }
  return merged
}

function mergeTimetableOverrides(sharedOverrides, personalOverrides, now = new Date()) {
  const shared = pruneExpiredOverrides(normalizeOverrides(sharedOverrides), now)
  const personal = pruneExpiredOverrides(normalizeOverrides(personalOverrides), now)
  const merged = { ...shared }
  for (const [date, periods] of Object.entries(personal)) {
    merged[date] = { ...(merged[date] || {}), ...periods }
  }
  return merged
}

async function requestPersonalTimetable(profile, payload) {
  if (!movingClassEnabled(profile)) return null
  const user = await ensureSignedIn()
  const idToken = String(await user.getIdToken()).trim()
  const response = await fetch(PERSONAL_TIMETABLE_API_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || 'personal_timetable_failed')
  return body.data || {}
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
  }, { mergeFields: ['overrides', 'updatedAt'] })
}

function timetableStateFromSnapshot(snapshot, now = new Date()) {
  if (!snapshot.exists()) {
    return { weeklySchedule: normalizeWeeklySchedule(null), overrides: {} }
  }
  const data = snapshot.data() || {}
  return {
    weeklySchedule: normalizeWeeklySchedule(data.weeklySchedule),
    overrides: pruneExpiredOverrides(normalizeOverrides(data.overrides), now),
  }
}

export function useSharedTimetable(profile, now) {
  const signature = profileSignature(profile)
  const movingClass = movingClassEnabled(profile)
  const [weeklySchedule, setWeeklySchedule] = useState(() => loadWeeklySchedule())
  const [overrides, setOverrides] = useState(() => pruneExpiredOverrides(loadOverrides(), now))
  const [personalWeeklySchedule, setPersonalWeeklySchedule] = useState(() => movingClass
    ? loadPersonalWeeklyScheduleCache(profile)
    : normalizeWeeklySchedule(null))
  const [personalOverrides, setPersonalOverrides] = useState(() => movingClass
    ? loadPersonalOverridesCache(profile, now)
    : {})

  const refreshSharedTimetable = useCallback(async () => {
    if (!signature) return false
    try {
      await ensureSignedIn()
      const snapshot = await getDocFromServer(timetableRef(profile))
      const next = timetableStateFromSnapshot(snapshot, new Date())
      saveWeeklySchedule(next.weeklySchedule)
      saveOverrides(next.overrides)
      setWeeklySchedule(next.weeklySchedule)
      setOverrides(next.overrides)
      return true
    } catch (error) {
      console.error('Timetable server refresh failed:', error)
      return false
    }
  }, [signature])

  const refreshPersonalTimetable = useCallback(async () => {
    if (!signature || !movingClass) return false
    try {
      const data = await requestPersonalTimetable(profile, { action: 'load' })
      const nextWeekly = normalizeWeeklySchedule(data?.weeklySchedule)
      const nextOverrides = pruneExpiredOverrides(normalizeOverrides(data?.overrides), new Date())
      savePersonalWeeklyScheduleCache(profile, nextWeekly)
      savePersonalOverridesCache(profile, nextOverrides)
      setPersonalWeeklySchedule(nextWeekly)
      setPersonalOverrides(nextOverrides)
      return true
    } catch (error) {
      console.error('Personal timetable server refresh failed:', error)
      return false
    }
  }, [signature, movingClass])

  useEffect(() => {
    if (!signature) return undefined
    let stopped = false
    let unsubscribe = () => {}
    let removeRevalidation = () => {}
    let generation = 0

    const applySnapshot = (snapshot) => {
      if (stopped) return
      generation += 1
      const next = timetableStateFromSnapshot(snapshot, new Date())
      saveWeeklySchedule(next.weeklySchedule)
      saveOverrides(next.overrides)
      setWeeklySchedule(next.weeklySchedule)
      setOverrides(next.overrides)
    }

    const refreshFromServer = async () => {
      const startedAtGeneration = generation
      try {
        const snapshot = await getDocFromServer(timetableRef(profile))
        if (stopped || generation !== startedAtGeneration) return
        applySnapshot(snapshot)
      } catch (error) {
        if (!stopped) console.error('Timetable server revalidation failed:', error)
      }
    }

    ensureSignedIn()
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          timetableRef(profile),
          applySnapshot,
          (error) => console.error('Timetable realtime sync failed:', error),
        )
        removeRevalidation = installServerRevalidation(refreshFromServer)
        refreshFromServer()
        })
      .catch((error) => console.error('Timetable cloud connection failed:', error))

    return () => {
      stopped = true
      unsubscribe()
      removeRevalidation()
    }
  }, [signature])

  useEffect(() => {
    if (!signature || !movingClass) {
      setPersonalWeeklySchedule(normalizeWeeklySchedule(null))
      setPersonalOverrides({})
      return undefined
    }
    setPersonalWeeklySchedule(loadPersonalWeeklyScheduleCache(profile))
    setPersonalOverrides(loadPersonalOverridesCache(profile, new Date()))
    let stopped = false
    const refresh = async () => {
      if (stopped) return
      await refreshPersonalTimetable()
    }
    refresh()
    const removeRevalidation = installServerRevalidation(refresh)
    return () => {
      stopped = true
      removeRevalidation()
    }
  }, [signature, movingClass, refreshPersonalTimetable])

  const commitWeeklySchedule = useCallback(async (nextSchedule) => {
    const normalized = normalizeWeeklySchedule(nextSchedule)
    try {
      await writeWeeklyScheduleCloud(profile, normalized)
      saveWeeklySchedule(normalized)
      setWeeklySchedule(normalized)
      return true
    } catch (error) {
      console.error('Shared timetable save failed:', error)
      return false
    }
  }, [signature])

  const commitOverrides = useCallback(async (nextOverrides) => {
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    try {
      await writeOverridesCloud(profile, normalized)
      saveOverrides(normalized)
      setOverrides(normalized)
      await refreshSharedTimetable()
      return true
    } catch (error) {
      console.error('Shared timetable override save failed:', error)
      return false
    }
  }, [signature, now])

  const commitPersonalWeeklySchedule = useCallback(async (nextSchedule) => {
    if (!movingClass) return false
    const normalized = normalizeWeeklySchedule(nextSchedule)
    const previous = personalWeeklySchedule
    savePersonalWeeklyScheduleCache(profile, normalized)
    setPersonalWeeklySchedule(normalized)
    try {
      const data = await requestPersonalTimetable(profile, { action: 'saveWeekly', weeklySchedule: normalized })
      const confirmed = normalizeWeeklySchedule(data?.weeklySchedule || normalized)
      savePersonalWeeklyScheduleCache(profile, confirmed)
      setPersonalWeeklySchedule(confirmed)
      return true
    } catch (error) {
      savePersonalWeeklyScheduleCache(profile, previous)
      setPersonalWeeklySchedule(previous)
      console.error('Personal timetable save failed:', error)
      return false
    }
  }, [signature, movingClass, personalWeeklySchedule])

  const commitPersonalOverrides = useCallback(async (nextOverrides) => {
    if (!movingClass) return false
    const normalized = pruneExpiredOverrides(nextOverrides, now)
    const previous = personalOverrides
    savePersonalOverridesCache(profile, normalized)
    setPersonalOverrides(normalized)
    try {
      const data = await requestPersonalTimetable(profile, { action: 'saveOverrides', overrides: normalized })
      const confirmed = pruneExpiredOverrides(normalizeOverrides(data?.overrides || normalized), now)
      savePersonalOverridesCache(profile, confirmed)
      setPersonalOverrides(confirmed)
      return true
    } catch (error) {
      savePersonalOverridesCache(profile, previous)
      setPersonalOverrides(previous)
      console.error('Personal timetable override save failed:', error)
      return false
    }
  }, [signature, movingClass, now, personalOverrides])

  const effectiveWeeklySchedule = movingClass
    ? mergeWeeklyTimetables(weeklySchedule, personalWeeklySchedule)
    : weeklySchedule
  const effectiveOverrides = movingClass
    ? mergeTimetableOverrides(overrides, personalOverrides, now)
    : overrides

  return {
    weeklySchedule: effectiveWeeklySchedule,
    overrides: effectiveOverrides,
    sharedWeeklySchedule: weeklySchedule,
    sharedOverrides: overrides,
    personalWeeklySchedule,
    personalOverrides,
    commitWeeklySchedule,
    commitOverrides,
    commitPersonalWeeklySchedule,
    commitPersonalOverrides,
    refreshSharedTimetable,
    refreshPersonalTimetable,
  }
}
