import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import {
  buildClassRoster,
  classNumberFromId,
  recoverClassRosterUsers,
} from '../lib/class-roster.js'
import { repairClassRoster } from '../lib/class-roster-repair-service.js'
import { handlePreviewV2, isPreviewV2Resource } from '../lib/preview-v2-service.js'
import {
  ReminderSectionError,
  prepareReminderSectionDelete,
  prepareReminderSectionRestore,
  prepareReminderSectionUpdate,
} from '../lib/reminder-sections.js'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Cache-Control', 'no-store')
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : ''
}

function isPreviewClassId(value) {
  return /^preview-class-(?:[1-9]|[12][0-9]|30)$/.test(String(value || '').trim())
}

async function readReminderSectionDocuments(classRef) {
  const snapshot = await classRef.collection('reminderCategories').get()
  return snapshot.docs.map((document) => ({ id: document.id, ...(document.data() || {}) }))
}

function reminderSectionArchiveRef(classRef, sectionId) {
  return classRef.collection('reminderSectionArchives').doc(sectionId)
}

async function migrateReminderSectionTodosToGeneral(db, classRef, sectionId) {
  if (!sectionId || sectionId === 'all' || sectionId === 'task') return { count: 0, todoIds: [] }
  const snapshot = await classRef.collection('todos').where('type', '==', sectionId).get()
  if (snapshot.empty) return { count: 0, todoIds: [] }

  const documents = snapshot.docs
  const todoIds = documents.map((document) => document.id)
  const chunkSize = 400
  let migrated = 0
  for (let start = 0; start < documents.length; start += chunkSize) {
    const batch = db.batch()
    const now = Date.now()
    documents.slice(start, start + chunkSize).forEach((document) => {
      batch.update(document.ref, {
        type: 'task',
        updatedAt: now,
      })
      migrated += 1
    })
    await batch.commit()
  }
  return { count: migrated, todoIds }
}

async function restoreSpecificReminderTodos(db, classRef, sectionId, todoIds = []) {
  const ids = [...new Set((Array.isArray(todoIds) ? todoIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))]
  if (!ids.length) return { count: 0, todoIds: [] }

  const chunkSize = 300
  const restoredIds = []
  for (let start = 0; start < ids.length; start += chunkSize) {
    const refs = ids.slice(start, start + chunkSize).map((id) => classRef.collection('todos').doc(id))
    const snapshots = await db.getAll(...refs)
    const batch = db.batch()
    const now = Date.now()
    let writes = 0
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return
      if (String(snapshot.data()?.type || '') !== 'task') return
      batch.update(snapshot.ref, {
        type: sectionId,
        updatedAt: now,
      })
      restoredIds.push(snapshot.id)
      writes += 1
    })
    if (writes) await batch.commit()
  }
  return { count: restoredIds.length, todoIds: restoredIds }
}

async function rememberReminderSectionMigration(classRef, sectionId, todoIds = []) {
  const ids = [...new Set((Array.isArray(todoIds) ? todoIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))]
  const archiveRef = reminderSectionArchiveRef(classRef, sectionId)
  if (!ids.length) {
    await archiveRef.delete().catch(() => {})
    return
  }
  await archiveRef.set({
    sectionId,
    todoIds: ids,
    updatedAt: Date.now(),
  })
}

async function restoreArchivedReminderSectionTodos(db, classRef, sectionId) {
  const archiveRef = reminderSectionArchiveRef(classRef, sectionId)
  const archive = await archiveRef.get()
  const todoIds = archive.exists && Array.isArray(archive.data()?.todoIds) ? archive.data().todoIds : []
  const restored = await restoreSpecificReminderTodos(db, classRef, sectionId, todoIds)
  return {
    ...restored,
    archiveRef,
    archiveExists: archive.exists,
  }
}

async function handleReminderSectionRequest({ db, classId, body }) {
  const action = String(body?.action || '').trim()
  const sectionId = String(body?.sectionId || '').trim().toLowerCase()
  const classRef = db.collection('classes').doc(classId)
  const documents = await readReminderSectionDocuments(classRef)

  if (action === 'update') {
    const section = prepareReminderSectionUpdate({
      documents,
      sectionId,
      label: body?.label,
      color: body?.color,
    })
    await classRef.collection('reminderCategories').doc(section.id).set(section)
    return { section }
  }

  if (action === 'restore') {
    const section = prepareReminderSectionRestore({
      documents,
      sectionId,
      label: body?.label,
      color: body?.color,
    })
    // Restore the archived reminder IDs while the section remains hidden. If any batch
    // fails, the archive and hidden section stay intact so the same restore can be retried.
    const restored = await restoreArchivedReminderSectionTodos(db, classRef, section.id)
    await classRef.collection('reminderCategories').doc(section.id).set(section)
    if (restored.archiveExists) {
      await restored.archiveRef.delete().catch((error) => {
        console.warn('reminder section restore archive cleanup failed', {
          sectionId: section.id,
          code: error?.code,
        })
      })
    }
    return {
      section,
      restoredCount: restored.count,
      restoredFrom: 'task',
    }
  }

  if (action === 'delete') {
    const plan = prepareReminderSectionDelete({ documents, sectionId })
    const migration = plan.migrateToGeneral
      ? await migrateReminderSectionTodosToGeneral(db, classRef, plan.current.id)
      : { count: 0, todoIds: [] }
    const sectionRef = classRef.collection('reminderCategories').doc(plan.current.id)

    try {
      if (plan.migrateToGeneral && !plan.deleteDocument) {
        await rememberReminderSectionMigration(classRef, plan.current.id, migration.todoIds)
      }
      if (plan.deleteDocument) await sectionRef.delete()
      else await sectionRef.set(plan.document)
    } catch (error) {
      if (migration.todoIds.length) {
        await restoreSpecificReminderTodos(db, classRef, plan.current.id, migration.todoIds).catch(() => {})
      }
      if (!plan.deleteDocument) {
        await reminderSectionArchiveRef(classRef, plan.current.id).delete().catch(() => {})
      }
      throw error
    }

    return {
      section: plan.document,
      deleted: plan.deleteDocument,
      migratedCount: migration.count,
      migratedTo: plan.migrateToGeneral ? 'task' : null,
    }
  }

  throw new ReminderSectionError('reminder-section/invalid-action', 'Invalid reminder section action')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const repairMode = String(req.query?.mode || '').trim() === 'repair'
  const reminderSectionMode = String(req.query?.mode || '').trim() === 'reminder-sections'
  if ((repairMode || reminderSectionMode) && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!repairMode && !reminderSectionMode && !['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'missing_auth',
      message: '로그인 정보를 확인하지 못했어요.',
    })
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const db = adminDb()
    const identity = await db.collection('users').doc(decoded.uid).get()
    if (!identity.exists) {
      return res.status(403).json({
        ok: false,
        error: 'identity_missing',
        message: '학생 정보를 확인하지 못했어요.',
      })
    }

    const classId = String(identity.data()?.classId || '').trim()
    const classNumber = classNumberFromId(classId)
    if (!classNumber) {
      return res.status(403).json({
        ok: false,
        error: 'invalid_class',
        message: '반 정보를 확인하지 못했어요.',
      })
    }

    if (reminderSectionMode) {
      if (!isPreviewClassId(classId)) {
        return res.status(403).json({
          ok: false,
          error: 'reminder-section/preview-class-required',
          message: '프리뷰 반에서만 섹션 설정을 변경할 수 있어요.',
        })
      }
      try {
        const data = await handleReminderSectionRequest({ db, classId, body: req.body || {} })
        return res.status(200).json({ ok: true, data })
      } catch (error) {
        if (error instanceof ReminderSectionError) {
          return res.status(400).json({
            ok: false,
            error: error.code,
            message: error.message,
          })
        }
        throw error
      }
    }

    if (repairMode) {
      const result = await repairClassRoster({ db, classId })
      console.info('class-roster repair completed', { classId, ...result })
      return res.status(200).json({ ok: true, ...result })
    }

    const studentKey = String(identity.data()?.studentKey || '').trim()
    const name = String(identity.data()?.name || '').trim().slice(0, 20)
    if (!studentKey || !name) {
      return res.status(403).json({
        ok: false,
        error: 'invalid_class',
        message: '반 정보를 확인하지 못했어요.',
      })
    }

    const previewResource = String(req.method === 'GET' ? req.query?.resource || '' : req.body?.resource || '').trim()
    if (isPreviewV2Resource(previewResource)) {
      const payload = await handlePreviewV2(
        { db, classId, classNumber, studentKey, name },
        { method: req.method, resource: previewResource, body: req.body || {} },
      )
      return res.status(200).json(payload)
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' })
    }

    const classRef = db.collection('classes').doc(classId)
    const [usersSnapshot, membersSnapshot, presenceSnapshot, activitySnapshot, academicSnapshot] = await Promise.all([
      db.collection('users').where('classId', '==', classId).get(),
      classRef.collection('members').get(),
      classRef.collection('presence').get(),
      classRef.collection('activity').get(),
      classRef.collection('academicEvents').get(),
    ])

    const memberKeys = new Set(
      membersSnapshot.docs
        .map((snapshot) => String(snapshot.id || '').trim())
        .filter(Boolean),
    )
    const rawUsers = usersSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const activities = activitySnapshot.docs.map((snapshot) => snapshot.data() || {})
    const academicEvents = academicSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const recovery = recoverClassRosterUsers({
      classId,
      memberKeys,
      users: rawUsers,
      activities,
      academicEvents,
    })
    const presence = presenceSnapshot.docs.map((snapshot) => snapshot.data() || {})
    const roster = buildClassRoster({
      classId,
      users: recovery.users,
      presence,
      nowMs: Date.now(),
    })
    const unresolved = roster.unresolved + recovery.unresolvedKeys.length

    if (unresolved > 0) {
      console.warn('class-roster unresolved legacy members', {
        classId,
        legacyMemberCount: memberKeys.size,
        unresolved,
        recoveredFromHistory: recovery.recoveredFromHistory.length,
      })
    }

    return res.status(200).json({
      ok: true,
      classId,
      classNumber,
      legacyMemberCount: memberKeys.size,
      total: roster.total,
      online: roster.online,
      unresolved,
      recoveredFromHistory: recovery.recoveredFromHistory.length,
      members: roster.members,
      generatedAt: Date.now(),
    })
  } catch (error) {
    const code = String(error?.code || '')
    if (code.startsWith('auth/')) {
      return res.status(401).json({
        ok: false,
        error: 'invalid_auth',
        message: '로그인 정보가 만료됐어요. 앱을 다시 열어 주세요.',
      })
    }
    if (repairMode) {
      console.error('class-roster repair failed', { code, message: error?.message })
      return res.status(502).json({
        ok: false,
        error: code || 'class_roster_repair_failed',
        message: '반 명단 정리를 완료하지 못했어요.',
      })
    }
    if (reminderSectionMode) {
      console.error('reminder section save failed', { code, message: error?.message })
      return res.status(502).json({
        ok: false,
        error: code || 'reminder-section/server',
        message: '섹션 설정을 저장하지 못했어요.',
      })
    }
    const requestedStatus = Number(error?.status || 0)
    if (requestedStatus >= 400 && requestedStatus < 500) {
      return res.status(requestedStatus).json({
        ok: false,
        error: code || 'preview_request_failed',
        message: String(error?.message || '테스트 요청을 처리하지 못했어요.').slice(0, 180),
      })
    }
    console.error('class-roster failed', { code, message: error?.message })
    return res.status(502).json({
      ok: false,
      error: code || 'class_roster_failed',
      message: '반 정보를 불러오지 못했어요.',
    })
  }
}