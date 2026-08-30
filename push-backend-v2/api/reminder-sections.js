import { adminAuth, adminDb } from '../lib/firebase-admin.js'
import {
  ReminderSectionError,
  prepareReminderSectionDelete,
  prepareReminderSectionUpdate,
} from '../lib/reminder-sections.js'

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

function previewClassId(value) {
  const classId = String(value || '').trim()
  return /^preview-class-(?:[1-9]|[12][0-9]|30)$/.test(classId) ? classId : ''
}

async function requirePreviewStudent(req) {
  const token = bearerToken(req)
  if (!token) return { error: { status: 401, body: { ok: false, error: 'reminder-section/auth-required' } } }
  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const snapshot = await adminDb().collection('users').doc(decoded.uid).get()
    if (!snapshot.exists) {
      return { error: { status: 403, body: { ok: false, error: 'reminder-section/profile-required' } } }
    }
    const identity = snapshot.data() || {}
    const classId = previewClassId(identity.classId)
    if (!classId) {
      return { error: { status: 403, body: { ok: false, error: 'reminder-section/preview-class-required' } } }
    }
    return { decoded, classId }
  } catch {
    return { error: { status: 401, body: { ok: false, error: 'reminder-section/auth-required' } } }
  }
}

async function readSectionDocuments(classRef) {
  const snapshot = await classRef.collection('reminderCategories').get()
  return snapshot.docs.map((document) => ({ id: document.id, ...(document.data() || {}) }))
}

async function migrateSectionTodosToGeneral(classRef, sectionId) {
  if (!sectionId || sectionId === 'all' || sectionId === 'task') return 0
  const snapshot = await classRef.collection('todos').where('type', '==', sectionId).get()
  if (snapshot.empty) return 0

  const documents = snapshot.docs
  const chunkSize = 400
  let migrated = 0
  for (let start = 0; start < documents.length; start += chunkSize) {
    const batch = adminDb().batch()
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
  return migrated
}

function sectionErrorResponse(error) {
  if (error instanceof ReminderSectionError) {
    return { status: 400, body: { ok: false, error: error.code, message: error.message } }
  }
  return null
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const student = await requirePreviewStudent(req)
  if (student.error) return res.status(student.error.status).json(student.error.body)

  const action = String(req.body?.action || '').trim()
  const sectionId = String(req.body?.sectionId || '').trim().toLowerCase()
  const classRef = adminDb().collection('classes').doc(student.classId)

  try {
    const documents = await readSectionDocuments(classRef)

    if (action === 'update') {
      const section = prepareReminderSectionUpdate({
        documents,
        sectionId,
        label: req.body?.label,
        color: req.body?.color,
      })
      await classRef.collection('reminderCategories').doc(section.id).set(section)
      return res.status(200).json({ ok: true, data: { section } })
    }

    if (action === 'delete') {
      const plan = prepareReminderSectionDelete({ documents, sectionId })
      const migratedCount = plan.migrateToGeneral
        ? await migrateSectionTodosToGeneral(classRef, plan.current.id)
        : 0
      const sectionRef = classRef.collection('reminderCategories').doc(plan.current.id)
      if (plan.deleteDocument) await sectionRef.delete()
      else await sectionRef.set(plan.document)
      return res.status(200).json({
        ok: true,
        data: {
          section: plan.document,
          deleted: plan.deleteDocument,
          migratedCount,
          migratedTo: plan.migrateToGeneral ? 'task' : null,
        },
      })
    }

    return res.status(400).json({ ok: false, error: 'reminder-section/invalid-action' })
  } catch (error) {
    const known = sectionErrorResponse(error)
    if (known) return res.status(known.status).json(known.body)
    console.error('reminder section save failed', {
      action,
      sectionId,
      classId: student.classId,
      code: error?.code,
      message: error?.message,
    })
    return res.status(500).json({ ok: false, error: 'reminder-section/server' })
  }
}
