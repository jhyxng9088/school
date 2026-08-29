import { adminDb } from '../lib/firebase-admin.js'

const TARGET_CLASSES = [1, 3, 11]
const EDU_CODE = 'J10'
const SCHOOL_CODE = '7530093'
const GRADE = 2
const FROM = '20260831'
const TO = '20260904'
const DAY_KEYS = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' }
const REGULAR_PERIODS = { mon: 6, tue: 6, wed: 7, thu: 6, fri: 7 }

function dayKey(rawDate) {
  if (!/^\d{8}$/.test(String(rawDate || ''))) return ''
  const text = String(rawDate)
  const date = new Date(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)), 12, 0, 0, 0)
  return DAY_KEYS[date.getDay()] || ''
}

function buildWeeklySchedule(rows, classNumber) {
  const schedule = {
    mon: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, ''])),
    tue: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, ''])),
    wed: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, ''])),
    thu: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, ''])),
    fri: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, ''])),
  }

  for (const row of rows) {
    if (Number(row?.grade) !== GRADE || Number(row?.class) !== classNumber) continue
    const key = dayKey(row?.date)
    const period = Number(row?.period || 0)
    const subject = String(row?.subject || '').trim().slice(0, 20)
    if (!key || !subject || !Number.isInteger(period) || period < 1 || period > REGULAR_PERIODS[key]) continue
    schedule[key][period] = subject
  }
  return schedule
}

function subjectCount(schedule) {
  return Object.values(schedule).flatMap((periods) => Object.values(periods)).filter((value) => String(value || '').trim()).length
}

async function fetchClassRows(classNumber) {
  const url = new URL('https://kschoolinfo.com/api/v1/timetable')
  Object.entries({
    eduCode: EDU_CODE,
    schoolCode: SCHOOL_CODE,
    grade: GRADE,
    class: classNumber,
    kind: 'his',
    from: FROM,
    to: TO,
  }).forEach(([key, value]) => url.searchParams.set(key, String(value)))

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`class_${classNumber}_mirror_http_${response.status}`)
  const payload = await response.json()
  if (payload?.ok !== true) throw new Error(`class_${classNumber}_mirror_failed`)
  if (String(payload?.meta?.source || '').toUpperCase() !== 'NEIS') throw new Error(`class_${classNumber}_source_not_neis`)
  const rows = Array.isArray(payload.data) ? payload.data : []
  if (!rows.length) throw new Error(`class_${classNumber}_no_rows`)
  return rows
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  try {
    const db = adminDb()
    const results = []
    for (const classNumber of TARGET_CLASSES) {
      const rows = await fetchClassRows(classNumber)
      const weeklySchedule = buildWeeklySchedule(rows, classNumber)
      const count = subjectCount(weeklySchedule)
      if (count < 20) throw new Error(`class_${classNumber}_incomplete_schedule_${count}`)

      const ref = db.collection('classes').doc(`class-${classNumber}`).collection('settings').doc('timetable')
      const updatedAt = Date.now()
      await ref.set({ weeklySchedule, updatedAt }, { merge: true })
      const verified = await ref.get()
      const stored = verified.data() || {}
      const storedCount = subjectCount(stored.weeklySchedule || {})
      if (!verified.exists || storedCount !== count) throw new Error(`class_${classNumber}_firestore_verify_failed`)

      results.push({
        classNumber,
        source: 'NEIS',
        rowCount: rows.length,
        subjectCount: count,
        updatedAt,
        weeklySchedule: stored.weeklySchedule,
      })
    }

    return res.status(200).json({ ok: true, schoolCode: SCHOOL_CODE, grade: GRADE, from: FROM, to: TO, results })
  } catch (error) {
    console.error('NEIS bootstrap failed', { message: error?.message })
    return res.status(500).json({ ok: false, error: String(error?.message || 'bootstrap_failed') })
  }
}
