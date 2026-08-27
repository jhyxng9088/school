import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApp, getApps } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import {
  classKeyFor,
  ensureSignedIn,
  normalizeStudentProfile,
  profileSignature,
  readStudentProfile,
  studentKeyFor,
} from './school-sync'

const syncApp = getApps().some((app) => app.name === 'school-sync') ? getApp('school-sync') : null
if (!syncApp) throw new Error('School sync app is not initialized')
const db = getFirestore(syncApp)
const identityPromises = new Map()
const ACTIVITY_CACHE_VERSION = 'v1'
const PUSH_ACTIVITY_EVENT = 'school:activity-committed'

function activityCacheKey(profile) {
  const normalized = currentProfile(profile)
  const classKey = normalized ? classKeyFor(normalized) : ''
  return classKey ? `school.classActivity.${ACTIVITY_CACHE_VERSION}.${classKey}` : ''
}

function readActivityCache(profile) {
  const key = activityCacheKey(profile)
  if (!key) return {}
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeActivityCache(profile, value) {
  const key = activityCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(value || {}))
  } catch {
    // Attribution cache only preserves the last rendered state while offline.
  }
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

function currentProfile(profile) {
  return normalizeStudentProfile(profile) || readStudentProfile()
}

function safeId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 150)
}

function activityDocId(type, entityId) {
  return safeId(`${type}:${entityId}`)
}

function emitCommittedActivity(detail) {
  try {
    window.dispatchEvent(new CustomEvent(PUSH_ACTIVITY_EVENT, { detail }))
  } catch {
    // Firestore remains authoritative even if an old browser cannot emit the local event.
  }
}

function identityRef(uid) {
  return doc(db, 'users', uid)
}

async function ensureIdentity(profile) {
  const normalized = currentProfile(profile)
  if (!normalized) throw new Error('학생 정보가 없어.')
  const user = await ensureSignedIn()
  const cacheKey = `${user.uid}|${profileSignature(normalized)}`
  if (identityPromises.has(cacheKey)) return identityPromises.get(cacheKey)

  const pending = (async () => {
    const payload = {
      classId: classKeyFor(normalized),
      studentKey: studentKeyFor(normalized),
      name: normalized.name,
      updatedAt: Date.now(),
    }
    const ref = identityRef(user.uid)
    const snapshot = await getDoc(ref)
    await setDoc(ref, {
      ...payload,
      createdAt: snapshot.exists() ? Number(snapshot.data()?.createdAt || Date.now()) : Date.now(),
    }, { merge: true })
    return { ...payload, uid: user.uid, profile: normalized }
  })().catch((error) => {
    identityPromises.delete(cacheKey)
    throw error
  })

  identityPromises.set(cacheKey, pending)
  return pending
}

function activityCollection(profile) {
  const normalized = currentProfile(profile)
  return collection(db, 'classes', classKeyFor(normalized), 'activity')
}

function activityRef(profile, type, entityId) {
  const normalized = currentProfile(profile)
  return doc(db, 'classes', classKeyFor(normalized), 'activity', activityDocId(type, entityId))
}

export function activityKey(type, entityId) {
  return `${type}:${entityId}`
}

function subjectParticle(name) {
  const text = String(name || '').trim()
  if (!text) return '가'
  const code = text.charCodeAt(text.length - 1)
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 === 0 ? '가' : '이'
  return '가'
}

export function actorActionLabel(actorName, action = 'edited') {
  const name = String(actorName || '').trim()
  if (!name) return ''
  return `${name}${subjectParticle(name)} ${action === 'added' ? '추가함' : '수정함'}`
}

export function activityLabel(value) {
  if (!value?.actorName) return ''
  return actorActionLabel(value.actorName, value.action)
}

export function useClassActivity(profile = null) {
  const normalized = currentProfile(profile)
  const signature = profileSignature(normalized)
  const [activity, setActivity] = useState(() => readActivityCache(normalized))

  useEffect(() => {
    if (!signature) return undefined
    setActivity(readActivityCache(normalized))
    let stopped = false
    let unsubscribe = () => {}
    let removeRevalidation = () => {}
    let generation = 0

    const applySnapshot = (snapshot) => {
      if (stopped || snapshot.metadata?.fromCache) return
      generation += 1
      const next = {}
      snapshot.docs.forEach((item) => {
        const value = item.data() || {}
        if (!value.entityType || !value.entityId || !value.actorName) return
        next[activityKey(value.entityType, value.entityId)] = {
          entityType: String(value.entityType),
          entityId: String(value.entityId),
          actorName: String(value.actorName).slice(0, 20),
          actorStudentKey: String(value.actorStudentKey || ''),
          action: value.action === 'added' ? 'added' : 'edited',
          updatedAt: Number(value.updatedAt || 0),
        }
      })
      writeActivityCache(normalized, next)
      setActivity(next)
    }

    const refreshFromServer = async () => {
      const startedAtGeneration = generation
      try {
        const snapshot = await getDocsFromServer(activityCollection(normalized))
        if (stopped || generation !== startedAtGeneration) return
        applySnapshot(snapshot)
      } catch (error) {
        if (!stopped) console.error('Class activity server revalidation failed:', error)
      }
    }

    ensureIdentity(normalized)
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          activityCollection(normalized),
          applySnapshot,
          (error) => console.error('Class activity sync failed:', error),
        )
        removeRevalidation = installServerRevalidation(refreshFromServer)
      })
      .catch((error) => console.error('Class activity connection failed:', error))
    return () => {
      stopped = true
      unsubscribe()
      removeRevalidation()
    }
  }, [signature])

  return activity
}

export async function recordClassActivities(profile, entries) {
  const normalized = currentProfile(profile)
  const items = Array.isArray(entries) ? entries.filter((entry) => entry?.entityType && entry?.entityId) : []
  if (!normalized || !items.length) return

  const identity = await ensureIdentity(normalized)
  const batch = writeBatch(db)
  const updatedAt = Date.now()
  const committed = []

  items.forEach((entry) => {
    const entityType = String(entry.entityType).slice(0, 30)
    const entityId = String(entry.entityId).slice(0, 120)
    const action = entry.action === 'added' ? 'added' : 'edited'
    const sourceId = activityDocId(entityType, entityId)
    batch.set(activityRef(normalized, entityType, entityId), {
      entityType,
      entityId,
      actorName: identity.profile.name,
      actorStudentKey: identity.studentKey,
      action,
      updatedAt,
    })
    committed.push({ entityType, entityId, sourceId, action })
  })

  await batch.commit()
  committed.forEach((entry) => emitCommittedActivity({
    ...entry,
    actorStudentKey: identity.studentKey,
    updatedAt,
  }))
}

export function recordClassActivity(profile, entityType, entityId, action = 'edited') {
  return recordClassActivities(profile, [{ entityType, entityId, action }])
}

function academicCollection(profile) {
  const normalized = currentProfile(profile)
  return collection(db, 'classes', classKeyFor(normalized), 'academicEvents')
}

function academicRef(profile, eventId) {
  const normalized = currentProfile(profile)
  return doc(db, 'classes', classKeyFor(normalized), 'academicEvents', safeId(eventId))
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

const ACADEMIC_IMPORTANT_PREFIX = '\u2063school-important\u2063'

function decodeAcademicDetail(value) {
  const raw = String(value || '').trim().slice(0, 500)
  const important = raw.startsWith(ACADEMIC_IMPORTANT_PREFIX)
  return {
    important,
    detail: important ? raw.slice(ACADEMIC_IMPORTANT_PREFIX.length).trimStart() : raw,
  }
}

function encodeAcademicDetail(value, important) {
  const room = Math.max(0, 500 - (important ? ACADEMIC_IMPORTANT_PREFIX.length : 0))
  const detail = String(value || '').trim().slice(0, room)
  return important ? `${ACADEMIC_IMPORTANT_PREFIX}${detail}` : detail
}

function safeAcademicEvent(value) {
  if (!value || typeof value !== 'object') return null
  const id = safeId(value.id)
  const title = String(value.title || '').trim().slice(0, 80)
  const startDate = String(value.startDate || '')
  const endDate = String(value.endDate || startDate)
  if (!id || !title || !validDate(startDate) || !validDate(endDate) || endDate < startDate) return null
  const detailState = decodeAcademicDetail(value.detail)
  return {
    id,
    title,
    startDate,
    endDate,
    detail: detailState.detail,
    important: Boolean(value.important) || detailState.important,
    createdAt: Number(value.createdAt || Date.now()),
    updatedAt: Number(value.updatedAt || value.createdAt || Date.now()),
    creatorStudentKey: String(value.creatorStudentKey || ''),
    creatorName: String(value.creatorName || '').slice(0, 20),
    lastEditedByStudentKey: String(value.lastEditedByStudentKey || ''),
    lastEditedByName: String(value.lastEditedByName || '').slice(0, 20),
    lastAction: value.lastAction === 'added' ? 'added' : 'edited',
  }
}

function academicEventsFromSnapshot(snapshot) {
  return snapshot.docs
    .map((item) => safeAcademicEvent({ id: item.id, ...item.data() }))
    .filter(Boolean)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
}

function newAcademicId() {
  return `academic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const ACADEMIC_CACHE_VERSION = 'v1'

function academicCacheKey(profile) {
  const normalized = currentProfile(profile)
  const classKey = classKeyFor(normalized)
  return classKey ? `school.academicEvents.${ACADEMIC_CACHE_VERSION}.${classKey}` : ''
}

function readAcademicCache(profile) {
  const key = academicCacheKey(profile)
  if (!key) return []
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(stored)
      ? stored.map(safeAcademicEvent).filter(Boolean).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
      : []
  } catch {
    return []
  }
}

function writeAcademicCache(profile, events) {
  const key = academicCacheKey(profile)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(events || []))
  } catch {
    // Cache only accelerates first paint. Firestore remains authoritative.
  }
}

export function useSharedAcademic(profile) {
  const normalized = currentProfile(profile)
  const signature = profileSignature(normalized)
  const studentKey = studentKeyFor(normalized)
  const [events, setEvents] = useState(() => readAcademicCache(normalized))

  useEffect(() => {
    if (!signature) return undefined
    setEvents(readAcademicCache(normalized))
    let stopped = false
    let unsubscribe = () => {}
    let removeRevalidation = () => {}
    let generation = 0

    const applySnapshot = (snapshot) => {
      if (stopped || snapshot.metadata?.fromCache) return
      generation += 1
      const next = academicEventsFromSnapshot(snapshot)
      writeAcademicCache(normalized, next)
      setEvents(next)
    }

    const refreshFromServer = async () => {
      const startedAtGeneration = generation
      try {
        const snapshot = await getDocsFromServer(academicCollection(normalized))
        if (stopped || generation !== startedAtGeneration) return
        applySnapshot(snapshot)
      } catch (error) {
        if (!stopped) console.error('Academic schedule server revalidation failed:', error)
      }
    }

    ensureIdentity(normalized)
      .then(() => {
        if (stopped) return
        unsubscribe = onSnapshot(
          academicCollection(normalized),
          applySnapshot,
          (error) => console.error('Academic schedule sync failed:', error),
        )
        removeRevalidation = installServerRevalidation(refreshFromServer)
      })
      .catch((error) => console.error('Academic schedule connection failed:', error))
    return () => {
      stopped = true
      unsubscribe()
      removeRevalidation()
    }
  }, [signature])

  const saveEvent = useCallback(async (input) => {
    const identity = await ensureIdentity(normalized)
    const id = safeId(input?.id) || newAcademicId()
    const ref = academicRef(normalized, id)
    const existingSnapshot = await getDoc(ref)
    const existing = existingSnapshot.exists() ? safeAcademicEvent({ id, ...existingSnapshot.data() }) : null
    const startDate = String(input?.startDate || '')
    const endDate = String(input?.endDate || startDate)
    const candidate = safeAcademicEvent({
      id,
      title: input?.title,
      startDate,
      endDate,
      detail: encodeAcademicDetail(input?.detail, Boolean(input?.important)),
      important: Boolean(input?.important),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      creatorStudentKey: existing?.creatorStudentKey || identity.studentKey,
      creatorName: existing?.creatorName || identity.profile.name,
      lastEditedByStudentKey: identity.studentKey,
      lastEditedByName: identity.profile.name,
      lastAction: existing ? 'edited' : 'added',
    })
    if (!candidate) throw new Error('학사일정 정보를 확인해줘.')
    const { important: _important, ...storedCandidate } = candidate
    storedCandidate.detail = encodeAcademicDetail(candidate.detail, candidate.important)
    await setDoc(ref, storedCandidate)
    emitCommittedActivity({
      entityType: 'academic',
      entityId: id,
      sourceId: id,
      actorStudentKey: identity.studentKey,
      action: candidate.lastAction,
      updatedAt: candidate.updatedAt,
    })
    return candidate
  }, [signature])

  const deleteEvent = useCallback(async (eventId) => {
    const identity = await ensureIdentity(normalized)
    const ref = academicRef(normalized, eventId)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const event = safeAcademicEvent({ id: eventId, ...snapshot.data() })
    if (!event || event.creatorStudentKey !== identity.studentKey) {
      throw new Error('이 일정은 처음 추가한 학생만 삭제할 수 있어.')
    }
    await deleteDoc(ref)
  }, [signature])

  return useMemo(() => ({
    events,
    studentKey,
    saveEvent,
    deleteEvent,
  }), [events, studentKey, saveEvent, deleteEvent])
}
